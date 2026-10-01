//
//  APIClient.swift
//  CloudClipboard
//
//  基于 URLSession 的 API 客户端。不引入任何第三方 HTTP 库。
//
//  统一处理：
//    - Authorization: Bearer <cca_...>（API Token）或
//      Cf-Access-Jwt-Assertion: <jwt>（Cloudflare Access，见 docs/ios-audit.md §2）
//    - x-device-id / x-device-name（与 Web 端一致）
//    - 401/403/429/5xx → APIError
//    - 指数退避重试（仅对可重试错误）
//

import Foundation

// MARK: - 配置

/// 运行时配置（Worker 地址 + 凭证 + 设备标识）。
/// 由 AppEnvironment 注入，测试可传内存实现。
///
/// 凭证有两种（见 docs/ios-audit.md §2），可同时存在：
/// - apiToken：长期有效的 API Token（`Authorization: Bearer cca_...`），Worker 直接校验
/// - accessJwt：Cloudflare Access JWT（`CF_Authorization` cookie 的值，短期有效），
///   以 `Cf-Access-Jwt-Assertion` 请求头发送，Worker 用 JWKS 验签
public struct APIConfiguration: Sendable, Equatable {
    public var baseURL: URL?
    public var apiToken: String?
    public var accessJwt: String?
    public var deviceId: String
    public var deviceName: String

    public init(baseURL: URL?, apiToken: String?, accessJwt: String? = nil, deviceId: String, deviceName: String) {
        self.baseURL = baseURL
        self.apiToken = apiToken
        self.accessJwt = accessJwt
        self.deviceId = deviceId
        self.deviceName = deviceName
    }

    public static let empty = APIConfiguration(baseURL: nil, apiToken: nil, deviceId: "", deviceName: "")

    /// 是否有任一可用凭证
    public var hasCredentials: Bool {
        !(apiToken ?? "").isEmpty || !(accessJwt ?? "").isEmpty
    }
}

/// 提供「当前配置」的抽象，方便在 App 运行期热更新（用户改设置后立即生效）。
public protocol APIConfigurationProviding: Sendable {
    func currentConfiguration() -> APIConfiguration
}

// MARK: - 客户端

public protocol APIClientProtocol: Sendable {
    func send<T: Decodable>(_ request: APIRequest, as type: T.Type) async throws -> T
    func send(_ request: APIRequest) async throws
    func healthCheck(baseURL: URL) async throws -> HealthResponse
}

public struct APIRequest: Sendable {
    public var method: HTTPMethod
    public var path: String
    public var query: [String: String]
    public var body: Data?
    public var requiresAuth: Bool
    /// 覆写默认配置（例如 Share Extension 直接读 App Group 配置）
    public var overrideConfiguration: APIConfiguration?

    public init(
        method: HTTPMethod = .get,
        path: String,
        query: [String: String] = [:],
        body: Data? = nil,
        requiresAuth: Bool = true,
        overrideConfiguration: APIConfiguration? = nil
    ) {
        self.method = method
        self.path = path
        self.query = query
        self.body = body
        self.requiresAuth = requiresAuth
        self.overrideConfiguration = overrideConfiguration
    }

    public enum HTTPMethod: String, Sendable {
        case get = "GET", post = "POST", put = "PUT", patch = "PATCH", delete = "DELETE"
    }
}

public final class APIClient: APIClientProtocol {
    private let configurationProvider: APIConfigurationProviding
    private let session: URLSession
    private let decoder: JSONDecoder
    private let retryPolicy: RetryPolicy
    private let sleeper: @Sendable (TimeInterval) async throws -> Void

    public init(
        configurationProvider: APIConfigurationProviding,
        session: URLSession? = nil,
        retryPolicy: RetryPolicy = .default,
        sleeper: @escaping @Sendable (TimeInterval) async throws -> Void = { seconds in
            try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
        }
    ) {
        self.configurationProvider = configurationProvider
        self.retryPolicy = retryPolicy
        self.sleeper = sleeper

        if let session {
            self.session = session
        } else {
            let config = URLSessionConfiguration.default
            config.timeoutIntervalForRequest = 20
            config.timeoutIntervalForResource = 60
            config.waitsForConnectivity = true
            config.httpAdditionalHeaders = ["Accept": "application/json"]
            config.requestCachePolicy = .reloadIgnoringLocalCacheData
            self.session = URLSession(configuration: config)
        }

        let decoder = JSONDecoder()
        // Worker 返回的时间戳是毫秒 Int64，DTO 侧自行转换，这里不做日期策略
        decoder.keyDecodingStrategy = .useDefaultKeys
        self.decoder = decoder
    }

    // MARK: 发送

    public func send<T: Decodable>(_ request: APIRequest, as type: T.Type) async throws -> T {
        let data = try await perform(request)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.invalidResponse(status: 200)
        }
    }

    public func send(_ request: APIRequest) async throws {
        _ = try await perform(request)
    }

    /// 健康检查（无需认证）
    public func healthCheck(baseURL: URL) async throws -> HealthResponse {
        let request = APIRequest(
            method: .get,
            path: "/api/health",
            requiresAuth: false,
            overrideConfiguration: APIConfiguration(
                baseURL: baseURL,
                apiToken: nil,
                deviceId: "probe",
                deviceName: "probe"
            )
        )
        return try await send(request, as: HealthResponse.self)
    }

    // MARK: 内部实现

    private func perform(_ request: APIRequest) async throws -> Data {
        let configuration = request.overrideConfiguration ?? configurationProvider.currentConfiguration()

        guard let baseURL = configuration.baseURL else {
            throw APIError.notConfigured
        }
        if request.requiresAuth, !configuration.hasCredentials {
            throw APIError.sessionExpired("尚未配置登录凭证")
        }

        let urlRequest = try build(request, configuration: configuration, baseURL: baseURL)

        var lastError: APIError = .transport("未知错误")
        for attempt in 0...retryPolicy.maxRetries {
            do {
                return try await execute(urlRequest)
            } catch let error as APIError {
                lastError = error
                guard error.isRetryable, attempt < retryPolicy.maxRetries else { throw error }
                let delay = retryPolicy.delay(forAttempt: attempt, error: error)
                try await sleeper(delay)
            } catch let error as URLError {
                let mapped = APIError.from(error)
                lastError = mapped
                guard mapped.isRetryable, attempt < retryPolicy.maxRetries else { throw mapped }
                try await sleeper(retryPolicy.delay(forAttempt: attempt, error: mapped))
            }
        }
        throw lastError
    }

    private func build(
        _ request: APIRequest,
        configuration: APIConfiguration,
        baseURL: URL
    ) throws -> URLRequest {
        let base = baseURL.absoluteString.hasSuffix("/")
            ? String(baseURL.absoluteString.dropLast())
            : baseURL.absoluteString
        guard var components = URLComponents(string: base + request.path) else {
            throw APIError.notConfigured
        }
        if !request.query.isEmpty {
            components.queryItems = request.query
                .sorted { $0.key < $1.key }
                .map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        guard let url = components.url else { throw APIError.notConfigured }

        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = request.method.rawValue
        urlRequest.setValue("application/json", forHTTPHeaderField: "Accept")
        if !configuration.deviceId.isEmpty {
            urlRequest.setValue(configuration.deviceId, forHTTPHeaderField: "x-device-id")
        }
        if !configuration.deviceName.isEmpty {
            urlRequest.setValue(configuration.deviceName, forHTTPHeaderField: "x-device-name")
        }
        if request.requiresAuth {
            if let token = configuration.apiToken, !token.isEmpty {
                urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }
            // Access JWT：Worker 用 team JWKS 验签（见 apps/worker/src/auth/index.ts）。
            // 注意：Cookie（CF_Authorization）由 URLSession 自动携带，走边缘 Access 会话；
            // 这里再显式带上 JWT 头，双保险（直连无 Access 的 API 域名时靠它）。
            if let jwt = configuration.accessJwt, !jwt.isEmpty {
                urlRequest.setValue(jwt, forHTTPHeaderField: "Cf-Access-Jwt-Assertion")
            }
        }
        if let body = request.body {
            urlRequest.httpBody = body
            urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return urlRequest
    }

    private func execute(_ urlRequest: URLRequest) async throws -> Data {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: urlRequest)
        } catch let error as URLError {
            throw APIError.from(error)
        } catch {
            throw APIError.transport("网络请求失败")
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse(status: 0)
        }

        switch http.statusCode {
        case 200..<300:
            // Cloudflare Access 在边缘拦截时会 302 到登录页；
            // URLSession 自动跟随跳转后拿到的是 200 + HTML 登录页，
            // 必须识别出来给明确提示，而不是报「无法解析的数据」。
            if Self.isAccessChallenge(data: data, response: http) {
                throw APIError.accessChallenge
            }
            return data
        case 401:
            throw APIError.sessionExpired(Self.errorMessage(from: data))
        case 403:
            throw APIError.forbidden(Self.errorMessage(from: data))
        case 429:
            let retryAfter = http.value(forHTTPHeaderField: "Retry-After").flatMap(TimeInterval.init)
            throw APIError.rateLimited(retryAfter: retryAfter)
        case 500...599:
            throw APIError.serverError(status: http.statusCode, message: Self.errorMessage(from: data))
        default:
            let envelope = try? JSONDecoder().decode(APIEnvelope.self, from: data)
            throw APIError.api(
                code: envelope?.error?.code ?? "API_ERROR",
                message: envelope?.error?.message ?? "请求失败（HTTP \(http.statusCode)）",
                status: http.statusCode
            )
        }
    }

    private static func errorMessage(from data: Data) -> String {
        (try? JSONDecoder().decode(APIEnvelope.self, from: data))?.error?.message ?? ""
    }

    /// 识别「被 Cloudflare Access 拦截」的响应：
    /// 最终 URL 落在 cloudflareaccess.com，或 Content-Type 是 HTML，或 body 以 < 开头。
    private static func isAccessChallenge(data: Data, response: HTTPURLResponse) -> Bool {
        if let host = response.url?.host?.lowercased(), host.contains("cloudflareaccess.com") {
            return true
        }
        let contentType = (response.value(forHTTPHeaderField: "Content-Type") ?? "").lowercased()
        if contentType.contains("text/html") {
            return true
        }
        let head = String(data: data.prefix(64), encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return head.hasPrefix("<")
    }
}

// MARK: - 通用响应信封

public struct APIEnvelope: Decodable, Sendable {
    public let success: Bool
    public let error: APIErrorBody?

    public init(success: Bool, error: APIErrorBody?) {
        self.success = success
        self.error = error
    }
}

public struct APIErrorBody: Decodable, Sendable, Equatable {
    public let code: String
    public let message: String
}

public struct SimpleResponse: Decodable, Sendable {
    public let success: Bool
}

public struct HealthResponse: Decodable, Sendable {
    public let success: Bool
    public let service: String?
    public let version: String?
    public let environment: String?
    public let timestamp: Int64?
    public let encryptionVersion: String?

    enum CodingKeys: String, CodingKey {
        case success, service, version, environment, timestamp
        case encryptionVersion = "encryption_version"
    }
}
