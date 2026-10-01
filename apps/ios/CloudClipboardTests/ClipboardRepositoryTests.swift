//
//  ClipboardRepositoryTests.swift
//  CloudClipboardTests
//
//  仓库层：上传/解密/离线排队/删除。
//  使用 fake API client + 内存 SwiftData，不触碰真实网络。
//

import XCTest
import SwiftData
import CryptoKit
@testable import CloudClipboard

@MainActor
final class ClipboardRepositoryTests: XCTestCase {
    private var container: ModelContainer!
    private var keychain: InMemoryKeychain!
    private var auth: AuthRepository!
    private var devices: DeviceRepository!
    private var crypto: CryptoService!
    private let seed = "test seed phrase for cloudclipboard"

    override func setUp() async throws {
        try await super.setUp()
        container = try ModelContainerFactory.makeInMemory()
        keychain = InMemoryKeychain()
        crypto = CryptoService()

        try keychain.set("cf_testuser1234567890abcdefghijkl", for: .userId)
        try keychain.set("cca_faketoken", for: .apiToken)
        try keychain.set(seed, for: .seedPhrase)
        try keychain.set("ios-test", for: .deviceId)
        try keychain.set("iPhone (Test) - App", for: .deviceName)

        auth = AuthRepository(
            apiClient: FakeAPIClient(),
            keychain: keychain,
            crypto: crypto
        )
        devices = DeviceRepository(apiClient: FakeAPIClient(), keychain: keychain)
    }

    override func tearDown() async throws {
        container = nil
        keychain = nil
        auth = nil
        devices = nil
        try await super.tearDown()
    }

    private func makeRepository(api: FakeAPIClientProtocol) -> ClipboardRepository {
        ClipboardRepository(
            apiClient: api,
            crypto: crypto,
            auth: auth,
            deviceRepository: devices,
            modelContainer: container
        )
    }

    // MARK: 上传

    func testPushEncryptsBeforeUpload() async throws {
        let api = FakeAPIClient()
        let repository = makeRepository(api: api)

        let result = await repository.push(content: "secret text")
        guard case .success(let id, _) = result else {
            return XCTFail("上传应当成功，实际 \(result)")
        }
        XCTAssertFalse(id.isEmpty)

        // 关键断言：发出去的 body 里绝对不能有明文
        let body = try XCTUnwrap(api.lastCreateBody)
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(json["type"] as? String, "text")
        XCTAssertNotNil(json["encrypted_data"])
        XCTAssertNotNil(json["wrapped_key"])
        XCTAssertNotNil(json["salt"])
        XCTAssertNotNil(json["iv"])
        XCTAssertFalse(String(data: body, encoding: .utf8)!.contains("secret text"))
    }

    func testPushThenReadBackPlaintext() async throws {
        let api = FakeAPIClient()
        let repository = makeRepository(api: api)

        _ = await repository.push(content: "round trip content")

        let item = try XCTUnwrap(repository.items.first)
        XCTAssertEqual(repository.plaintext(for: item), "round trip content")
    }

    func testPushEmptyContentFails() async {
        let repository = makeRepository(api: FakeAPIClient())
        let result = await repository.push(content: "   \n  ")
        guard case .failure(let message) = result else {
            return XCTFail("空内容应当失败")
        }
        XCTAssertFalse(message.isEmpty)
    }

    func testPushTypeInference() async {
        let api = FakeAPIClient()
        let repository = makeRepository(api: api)

        _ = await repository.push(content: "https://example.com/path")
        var json = try? JSONSerialization.jsonObject(with: api.lastCreateBody ?? Data()) as? [String: Any]
        XCTAssertEqual(json?["type"] as? String, "url")

        _ = await repository.push(content: "const a = () => 1")
        json = try? JSONSerialization.jsonObject(with: api.lastCreateBody ?? Data()) as? [String: Any]
        XCTAssertEqual(json?["type"] as? String, "code")
    }

    // MARK: 离线

    func testPushQueuesLocallyWhenOffline() async throws {
        let api = FakeAPIClient()
        api.shouldFailCreate = true
        let repository = makeRepository(api: api)

        let result = await repository.push(content: "offline content")
        guard case .queuedLocally = result else {
            return XCTFail("离线时应当入本地队列，实际 \(result)")
        }

        // 本地队列条目必须是密文状态
        let context = ModelContext(container)
        let pending = try context.fetch(
            FetchDescriptor<CachedClipboardItem>(predicate: #Predicate { $0.syncStateRaw == "pending" })
        )
        XCTAssertEqual(pending.count, 1)
        let item = try XCTUnwrap(pending.first)
        XCTAssertFalse(item.encryptedData.contains("offline content"))
        XCTAssertNotNil(item.wrappedKey)
    }

    func testFlushOutboxUploadsQueuedItems() async throws {
        let api = FakeAPIClient()
        api.shouldFailCreate = true
        let repository = makeRepository(api: api)

        _ = await repository.push(content: "queued content")
        XCTAssertEqual(try pendingCount(), 1)

        api.shouldFailCreate = false
        let synced = await repository.flushOutbox()
        XCTAssertEqual(synced, 1)
        XCTAssertEqual(try pendingCount(), 0)
    }

    func testRefreshFallsBackToCacheWhenOffline() async throws {
        let api = FakeAPIClient()
        let repository = makeRepository(api: api)

        _ = await repository.push(content: "cached content")
        XCTAssertEqual(repository.items.count, 1)

        // 换成离线状态的新仓库实例，读同一份 SwiftData
        let offlineAPI = FakeAPIClient()
        offlineAPI.shouldFailList = true
        let offlineRepository = makeRepository(api: offlineAPI)
        await offlineRepository.refresh()

        XCTAssertTrue(offlineRepository.isOffline)
        XCTAssertEqual(offlineRepository.items.count, 1, "离线时应回退到本地缓存")
    }

    // MARK: 删除

    func testDeleteRemovesFromList() async throws {
        let api = FakeAPIClient()
        let repository = makeRepository(api: api)
        _ = await repository.push(content: "to delete")

        let id = try XCTUnwrap(repository.items.first?.id)
        let ok = await repository.delete(id: id)
        XCTAssertTrue(ok)
        XCTAssertTrue(repository.items.isEmpty)
        XCTAssertNil(repository.plaintext(for: ClipboardItemDTO.placeholder(id: id)))
    }

    // MARK: 解密

    func testPlainItemIsReturnedAsIs() throws {
        let repository = makeRepository(api: FakeAPIClient())
        let plainItem = ClipboardItemDTO.placeholder(id: "plain-1", encryptedData: "already plain", plain: 1)
        XCTAssertEqual(repository.plaintext(for: plainItem), "already plain")
    }

    func testUndecryptableItemReturnsNil() throws {
        let repository = makeRepository(api: FakeAPIClient())
        let broken = ClipboardItemDTO.placeholder(id: "broken", encryptedData: "not-base64!!!", plain: 0)
        XCTAssertNil(repository.plaintext(for: broken))
    }

    func testCrossDeviceDecryption() throws {
        // 模拟「另一台设备用同一 userId + 种子短语加密」
        let userId = try XCTUnwrap(keychain.get(.userId))
        let otherMasterKey = try crypto.deriveMasterKey(seedPhrase: seed, userId: userId)
        let payload = try crypto.encryptClipboardContent("from another device", masterKey: otherMasterKey)

        let item = ClipboardItemDTO(
            id: "cross-1",
            deviceId: "mac-1",
            deviceName: "MacBook (PWA)",
            type: .text,
            encryptedData: payload.encrypted,
            iv: payload.iv,
            salt: payload.salt,
            wrappedKey: payload.wrappedKey,
            r2Key: nil,
            size: nil,
            mimeType: nil,
            filename: nil,
            plain: 0,
            createdAt: Int64(Date().timeIntervalSince1970 * 1000),
            expiresAt: nil,
            base64Content: nil
        )

        let repository = makeRepository(api: FakeAPIClient())
        XCTAssertEqual(repository.plaintext(for: item), "from another device")
    }

    // MARK: 搜索

    func testLocalSearchMatchesDecryptedContent() async throws {
        let repository = makeRepository(api: FakeAPIClient())
        _ = await repository.push(content: "ssh root@server")
        _ = await repository.push(content: "buy milk")

        repository.warmPlaintextCache()
        XCTAssertEqual(repository.search("ssh").count, 1)
        XCTAssertEqual(repository.search("milk").count, 1)
        XCTAssertEqual(repository.search("nonexistent").count, 0)
        XCTAssertEqual(repository.search("").count, 2)
    }

    // MARK: 辅助

    private func pendingCount() throws -> Int {
        let context = ModelContext(container)
        return try context.fetch(
            FetchDescriptor<CachedClipboardItem>(predicate: #Predicate { $0.syncStateRaw == "pending" })
        ).count
    }
}

// MARK: - 测试替身

extension ClipboardItemDTO {
    static func placeholder(
        id: String,
        encryptedData: String = "abc",
        plain: Int = 0
    ) -> ClipboardItemDTO {
        ClipboardItemDTO(
            id: id,
            deviceId: "d",
            deviceName: "n",
            type: .text,
            encryptedData: encryptedData,
            iv: "iviviviviviv",
            salt: "salsalsalsalsal",
            wrappedKey: "wrapwrapwrap",
            r2Key: nil,
            size: nil,
            mimeType: nil,
            filename: nil,
            plain: plain,
            createdAt: Int64(Date().timeIntervalSince1970 * 1000),
            expiresAt: nil,
            base64Content: nil
        )
    }
}

final class InMemoryKeychain: KeychainServiceProtocol, @unchecked Sendable {
    private var storage: [String: String] = [:]
    private let lock = NSLock()

    func set(_ value: String, for key: KeychainKey) throws {
        lock.lock(); defer { lock.unlock() }
        storage[key.rawValue] = value
    }

    func get(_ key: KeychainKey) -> String? {
        lock.lock(); defer { lock.unlock() }
        return storage[key.rawValue]
    }

    func remove(_ key: KeychainKey) {
        lock.lock(); defer { lock.unlock() }
        storage.removeValue(forKey: key.rawValue)
    }

    func removeAll() {
        lock.lock(); defer { lock.unlock() }
        storage.removeAll()
    }

    func hasKeychainBackedSeed() -> Bool { get(.seedPhrase) != nil }
}

protocol FakeAPIClientProtocol: APIClientProtocol {
    var lastCreateBody: Data? { get }
}

final class FakeAPIClient: FakeAPIClientProtocol, @unchecked Sendable {
    var shouldFailCreate = false
    var shouldFailList = false
    var shouldFailDelete = false
    private(set) var lastCreateBody: Data?

    private var storedItems: [ClipboardItemDTO] = []
    private let lock = NSLock()

    func send<T: Decodable>(_ request: APIRequest, as type: T.Type) async throws -> T {
        switch (request.method, request.path) {
        case (.get, "/api/me"):
            let payload = #"{"success":true,"user":{"id":"cf_testuser1234567890abcdefghijkl"}}"#
            return try decode(payload, as: T.self)

        case (.get, "/api/clipboard"):
            if shouldFailList { throw APIError.offline }
            let items = storedItems
            let json = try JSONSerialization.data(withJSONObject: [
                "success": true,
                "items": items.map(Self.jsonObject),
                "count": items.count,
            ])
            return try decode(json, as: T.self)

        case (.post, "/api/clipboard"):
            if shouldFailCreate { throw APIError.offline }
            lastCreateBody = request.body
            let item = Self.makeDTO(from: request.body)
            lock.lock(); storedItems.insert(item, at: 0); lock.unlock()
            let json = try JSONSerialization.data(withJSONObject: [
                "success": true,
                "item": Self.jsonObject(item),
                "push": ["sent": 0, "total": 0],
            ])
            return try decode(json, as: T.self)

        case (.delete, _):
            if shouldFailDelete { throw APIError.offline }
            let id = String(request.path.split(separator: "/").last ?? "")
            lock.lock(); storedItems.removeAll { $0.id == id }; lock.unlock()
            return try decode(#"{"success":true}"#, as: T.self)

        case (.post, "/api/devices/register"):
            let payload = #"{"success":true,"device":{"id":"ios-test","name":"iPhone","platform":"ios","browser":null,"device_type":"other","last_seen":0,"created_at":0,"updated_at":0,"revoked_at":null,"online":true,"status":"trusted","bark_url":null}}"#
            return try decode(payload, as: T.self)

        case (.get, "/api/prefs"):
            return try decode(#"{"success":true,"prefs":{}}"#, as: T.self)

        case (.get, "/api/devices"):
            return try decode(#"{"success":true,"devices":[]}"#, as: T.self)

        default:
            throw APIError.api(code: "NOT_FOUND", message: "fake client 未实现 \(request.path)", status: 404)
        }
    }

    func send(_ request: APIRequest) async throws {
        _ = try await send(request, as: SimpleResponse.self)
    }

    func healthCheck(baseURL: URL) async throws -> HealthResponse {
        try decode(#"{"success":true,"service":"CloudClipboard","version":"2.0.0"}"#, as: HealthResponse.self)
    }

    private func decode<T: Decodable>(_ raw: String, as type: T.Type) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(raw.utf8))
    }

    private func decode<T: Decodable>(_ data: Data, as type: T.Type) throws -> T {
        try JSONDecoder().decode(T.self, from: data)
    }

    private static func makeDTO(from body: Data?) -> ClipboardItemDTO {
        let json = (try? JSONSerialization.jsonObject(with: body ?? Data())) as? [String: Any] ?? [:]
        return ClipboardItemDTO(
            id: UUID().uuidString,
            deviceId: "ios-test",
            deviceName: "iPhone (Test) - App",
            type: ClipboardType(rawValue: json["type"] as? String ?? "text") ?? .text,
            encryptedData: json["encrypted_data"] as? String,
            iv: json["iv"] as? String,
            salt: json["salt"] as? String,
            wrappedKey: json["wrapped_key"] as? String,
            r2Key: nil,
            size: json["size"] as? Int,
            mimeType: nil,
            filename: nil,
            plain: 0,
            createdAt: Int64(Date().timeIntervalSince1970 * 1000),
            expiresAt: nil,
            base64Content: nil
        )
    }

    private static func jsonObject(_ item: ClipboardItemDTO) -> [String: Any] {
        var dict: [String: Any] = [
            "id": item.id,
            "device_id": item.deviceId,
            "device_name": item.deviceName,
            "type": item.type.rawValue,
            "plain": item.plain ?? 0,
            "created_at": item.createdAt,
        ]
        if let value = item.encryptedData { dict["encrypted_data"] = value }
        if let value = item.iv { dict["iv"] = value }
        if let value = item.salt { dict["salt"] = value }
        if let value = item.wrappedKey { dict["wrapped_key"] = value }
        return dict
    }
}
