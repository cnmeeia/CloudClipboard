//
//  APIClientTests.swift
//  CloudClipboardTests
//
//  网络层：请求构造、错误映射、重试策略。
//  使用 URLProtocol stub，不依赖真实网络。
//

import XCTest
@testable import CloudClipboard

final class APIClientTests: XCTestCase {
    private var session: URLSession!

    override func setUp() {
        super.setUp()
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [URLProtocolStub.self]
        session = URLSession(configuration: config)
        URLProtocolStub.reset()
    }

    override func tearDown() {
        URLProtocolStub.reset()
        session = nil
        super.tearDown()
    }

    private func makeClient(retry: RetryPolicy = .none) -> APIClient {
        let store = TestConfigurationStore(
            configuration: APIConfiguration(
                baseURL: URL(string: "https://clip.0272.de5.net")!,
                apiToken: "cca_testtoken",
                deviceId: "ios-test",
                deviceName: "iPhone (Test) - App"
            )
        )
        return APIClient(
            configurationProvider: store,
            session: session,
            retryPolicy: retry,
            sleeper: { _ in }  // 测试中不真的等待
        )
    }

    // MARK: 请求构造

    func testSetsAuthorizationAndDeviceHeaders() async throws {
        URLProtocolStub.handler = { request in
            XCTAssertEqual(request.url?.absoluteString, "https://clip.0272.de5.net/api/me")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer cca_testtoken")
            XCTAssertEqual(request.value(forHTTPHeaderField: "x-device-id"), "ios-test")
            XCTAssertEqual(request.value(forHTTPHeaderField: "x-device-name"), "iPhone (Test) - App")
            XCTAssertEqual(request.httpMethod, "GET")
            let data = #"{"success":true,"user":{"id":"cf_abc"}}"#.data(using: .utf8)!
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, data)
        }

        let response = try await makeClient().send(Endpoints.me(), as: MeResponse.self)
        XCTAssertEqual(response.user.id, "cf_abc")
    }

    func testListClipboardSendsLimitQuery() async throws {
        URLProtocolStub.handler = { request in
            XCTAssertEqual(request.url?.absoluteString, "https://clip.0272.de5.net/api/clipboard?limit=200")
            let data = #"{"success":true,"items":[],"count":0}"#.data(using: .utf8)!
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, data)
        }

        let response = try await makeClient().send(Endpoints.listClipboard(limit: 200), as: ClipboardListResponse.self)
        XCTAssertTrue(response.items.isEmpty)
    }

    func testCreateClipboardPostsJSONBody() async throws {
        let body = ClipboardCreateRequest(
            type: .text,
            encryptedData: "abc",
            iv: "iviv",
            salt: "salt",
            wrappedKey: "wrap",
            size: 5
        )
        URLProtocolStub.handler = { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
            let json = try JSONSerialization.jsonObject(with: request.httpBody ?? Data()) as? [String: Any]
            XCTAssertEqual(json?["encrypted_data"] as? String, "abc")
            XCTAssertEqual(json?["wrapped_key"] as? String, "wrap")
            XCTAssertEqual(json?["type"] as? String, "text")

            let data = #"{"success":true,"item":{"id":"1","device_id":"d","device_name":"n","type":"text","encrypted_data":"abc","iv":"iviv","salt":"salt","wrapped_key":"wrap","r2_key":null,"size":5,"mime_type":null,"filename":null,"plain":0,"created_at":1700000000000,"expires_at":null},"push":{"sent":0,"total":0}}"#.data(using: .utf8)!
            return (HTTPURLResponse(url: request.url!, statusCode: 201, httpVersion: nil, headerFields: nil)!, data)
        }

        let response = try await makeClient().send(
            Endpoints.createClipboard(body: try JSONEncoder().encode(body)),
            as: ClipboardCreateResponse.self
        )
        XCTAssertEqual(response.item.id, "1")
    }

    // MARK: 错误映射

    func testUnauthorizedMapsToSessionExpired() async {
        URLProtocolStub.handler = { request in
            let data = #"{"success":false,"error":{"code":"UNAUTHORIZED","message":"登录已过期"}}"#.data(using: .utf8)!
            return (HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!, data)
        }

        do {
            _ = try await makeClient().send(Endpoints.me(), as: MeResponse.self)
            XCTFail("应当抛错")
        } catch let error as APIError {
            XCTAssertTrue(error.requiresReauthentication)
            XCTAssertEqual(error.errorDescription, "登录已过期")
        } catch {
            XCTFail("错误类型不对: \(error)")
        }
    }

    func testRateLimitedReadsRetryAfterHeader() async {
        URLProtocolStub.handler = { request in
            let data = #"{"success":false,"error":{"code":"RATE_LIMITED","message":"太频繁"}}"#.data(using: .utf8)!
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: 429,
                httpVersion: nil,
                headerFields: ["Retry-After": "42"]
            )!
            return (response, data)
        }

        do {
            _ = try await makeClient().send(Endpoints.me(), as: MeResponse.self)
            XCTFail("应当抛错")
        } catch let error as APIError {
            guard case .rateLimited(let retryAfter) = error else {
                return XCTFail("期望 rateLimited，实际 \(error)")
            }
            XCTAssertEqual(retryAfter, 42)
            XCTAssertTrue(error.isRetryable)
        } catch {
            XCTFail("错误类型不对: \(error)")
        }
    }

    func testServerErrorIsRetryable() async {
        URLProtocolStub.handler = { request in
            let data = #"{"success":false,"error":{"code":"INTERNAL","message":"boom"}}"#.data(using: .utf8)!
            return (HTTPURLResponse(url: request.url!, statusCode: 503, httpVersion: nil, headerFields: nil)!, data)
        }

        do {
            _ = try await makeClient().send(Endpoints.me(), as: MeResponse.self)
            XCTFail("应当抛错")
        } catch let error as APIError {
            XCTAssertTrue(error.isRetryable)
            if case .serverError(let status, _) = error {
                XCTAssertEqual(status, 503)
            } else {
                XCTFail("期望 serverError，实际 \(error)")
            }
        } catch {
            XCTFail("错误类型不对: \(error)")
        }
    }

    func testOfflineErrorMessageIsHumanReadable() async {
        URLProtocolStub.handler = { _ in
            throw URLError(.notConnectedToInternet)
        }

        do {
            _ = try await makeClient().send(Endpoints.me(), as: MeResponse.self)
            XCTFail("应当抛错")
        } catch let error as APIError {
            XCTAssertEqual(error, .offline)
            // 关键：不能把 URLError(-1009) 直接给用户
            XCTAssertEqual(error.errorDescription, "网络不可用，正在等待网络恢复……")
            XCTAssertFalse(error.errorDescription!.contains("-1009"))
        } catch {
            XCTFail("错误类型不对: \(error)")
        }
    }

    func testInvalidJSONMapsToInvalidResponse() async {
        URLProtocolStub.handler = { request in
            let data = #"{invalid json"#.data(using: .utf8)!
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, data)
        }

        do {
            _ = try await makeClient().send(Endpoints.me(), as: MeResponse.self)
            XCTFail("应当抛错")
        } catch let error as APIError {
            XCTAssertEqual(error, .invalidResponse(status: 200))
        } catch {
            XCTFail("错误类型不对: \(error)")
        }
    }

    func testHTMLBodyMapsToAccessChallenge() async {
        // 200 + HTML：被 Cloudflare Access 边缘拦截后的登录页，
        // 必须报 accessChallenge（明确提示），而不是 invalidResponse。
        URLProtocolStub.handler = { request in
            let data = "<html>not json</html>".data(using: .utf8)!
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, data)
        }

        do {
            _ = try await makeClient().send(Endpoints.me(), as: MeResponse.self)
            XCTFail("应当抛错")
        } catch let error as APIError {
            XCTAssertEqual(error, .accessChallenge)
        } catch {
            XCTFail("错误类型不对: \(error)")
        }
    }

    // MARK: 重试

    func testRetriesOnServerErrorThenSucceeds() async throws {
        var attempts = 0
        URLProtocolStub.handler = { request in
            attempts += 1
            if attempts < 3 {
                return (HTTPURLResponse(url: request.url!, statusCode: 500, httpVersion: nil, headerFields: nil)!, Data())
            }
            let data = #"{"success":true,"user":{"id":"cf_retry"}}"#.data(using: .utf8)!
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, data)
        }

        let client = makeClient(retry: RetryPolicy(maxRetries: 3, baseDelay: 0, maxDelay: 0))
        let response = try await client.send(Endpoints.me(), as: MeResponse.self)
        XCTAssertEqual(response.user.id, "cf_retry")
        XCTAssertEqual(attempts, 3)
    }

    func testDoesNotRetryOnUnauthorized() async {
        var attempts = 0
        URLProtocolStub.handler = { request in
            attempts += 1
            return (HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!, Data())
        }

        let client = makeClient(retry: RetryPolicy(maxRetries: 5, baseDelay: 0, maxDelay: 0))
        _ = try? await client.send(Endpoints.me(), as: MeResponse.self)
        XCTAssertEqual(attempts, 1, "401 不应重试")
    }

    func testRetryPolicyBackoffIsCapped() {
        let policy = RetryPolicy(maxRetries: 5, baseDelay: 1, maxDelay: 4)
        for attempt in 0..<6 {
            let delay = policy.delay(forAttempt: attempt, error: .serverError(status: 500, message: ""))
            XCTAssertLessThanOrEqual(delay, 4)
            XCTAssertGreaterThan(delay, 0)
        }
    }

    func testRetryPolicyHonorsRetryAfter() {
        let policy = RetryPolicy(maxRetries: 5, baseDelay: 1, maxDelay: 30)
        let delay = policy.delay(forAttempt: 0, error: .rateLimited(retryAfter: 12))
        XCTAssertEqual(delay, 12, accuracy: 0.001)
    }

    // MARK: 未配置

    func testThrowsNotConfiguredWhenMissingBaseURL() async {
        let store = TestConfigurationStore(configuration: .empty)
        let client = APIClient(configurationProvider: store, session: session, retryPolicy: .none, sleeper: { _ in })
        do {
            _ = try await client.send(Endpoints.me(), as: MeResponse.self)
            XCTFail("应当抛错")
        } catch let error as APIError {
            XCTAssertEqual(error, .notConfigured)
        } catch {
            XCTFail("错误类型不对: \(error)")
        }
    }

    func testThrowsSessionExpiredWhenTokenMissing() async {
        let store = TestConfigurationStore(
            configuration: APIConfiguration(
                baseURL: URL(string: "https://clip.0272.de5.net")!,
                apiToken: nil,
                deviceId: "d",
                deviceName: "n"
            )
        )
        let client = APIClient(configurationProvider: store, session: session, retryPolicy: .none, sleeper: { _ in })
        do {
            _ = try await client.send(Endpoints.me(), as: MeResponse.self)
            XCTFail("应当抛错")
        } catch let error as APIError {
            XCTAssertTrue(error.requiresReauthentication)
        } catch {
            XCTFail("错误类型不对: \(error)")
        }
    }
}

// MARK: - 测试辅助

final class TestConfigurationStore: APIConfigurationProviding, @unchecked Sendable {
    private let configuration: APIConfiguration
    init(configuration: APIConfiguration) { self.configuration = configuration }
    func currentConfiguration() -> APIConfiguration { configuration }
}

final class URLProtocolStub: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    static func reset() {
        handler = nil
    }

    override class func canInit(with request: URLRequest) -> Bool { true }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let handler = Self.handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.unknown))
            return
        }
        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}
