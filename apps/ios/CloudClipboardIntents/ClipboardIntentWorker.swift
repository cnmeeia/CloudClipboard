//
//  ClipboardIntentWorker.swift
//  CloudClipboardIntents
//
//  App Intent 的实际执行逻辑。
//
//  在 Extension 里也能跑（有独立的一份最小实现）：
//    - 直接读 Keychain 里的 API Token + 种子短语
//    - 用 CryptoService 加密
//    - POST /api/clipboard
//
//  但 Extension 进程的内存/时间预算有限，所以 PBKDF2 结果会被缓存到 Keychain
//  （主 App 已经缓存过，这里通常能直接命中，避免重复 310k 次迭代）。
//

import Foundation
import CryptoKit
import Security
import CloudClipboardShared

public final class ClipboardIntentWorker: @unchecked Sendable {
    public static let shared = ClipboardIntentWorker()

    private let crypto = CryptoService()
    private let keychainService = "de.cloudclipboard.credentials"
    private let appGroupIdentifier = "group.de.cloudclipboard.ios.dev"

    private var masterKeyCache: SymmetricKey?

    public init() {}

    // MARK: 保存

    /// 保存内容（加密后上传）。返回 false 表示已入本地队列，联网后由主 App 重放。
    public func save(content: String) async -> Bool {
        guard let token = readKeychain("de.cloudclipboard.apikey.token"),
              let userId = readKeychain("de.cloudclipboard.apikey.userid"),
              let phrase = readKeychain("de.cloudclipboard.apikey.seed") else {
            // 尚未在 App 内完成初始化 → 入队，等用户打开 App
            SharedCommandBridge.shared.enqueue(.save(content: content))
            return false
        }

        guard let masterKey = try? masterKey(phrase: phrase, userId: userId) else {
            return false
        }
        guard let payload = try? crypto.encryptClipboardContent(content, masterKey: masterKey) else {
            return false
        }

        var request = URLRequest(url: baseURL.appendingPathComponent("/api/clipboard"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(deviceId, forHTTPHeaderField: "x-device-id")
        request.setValue(deviceName, forHTTPHeaderField: "x-device-name")
        request.timeoutInterval = 15

        let body: [String: Any] = [
            "type": inferType(content).rawValue,
            "encrypted_data": payload.encrypted,
            "iv": payload.iv,
            "salt": payload.salt,
            "wrapped_key": payload.wrappedKey,
            "size": content.utf8.count,
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                SharedCommandBridge.shared.enqueue(.save(content: content))
                return false
            }
            return true
        } catch {
            SharedCommandBridge.shared.enqueue(.save(content: content))
            return false
        }
    }

    // MARK: 读取

    /// 最新一条明文。Extension 无网络时使用本地 SwiftData 缓存。
    public func latestPlaintext() async -> String? {
        guard let token = readKeychain("de.cloudclipboard.apikey.token"),
              let userId = readKeychain("de.cloudclipboard.apikey.userid"),
              let phrase = readKeychain("de.cloudclipboard.apikey.seed"),
              let masterKey = try? masterKey(phrase: phrase, userId: userId) else {
            return nil
        }

        guard let url = URL(string: baseURL.absoluteString + "/api/clipboard?limit=5") else { return nil }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(deviceId, forHTTPHeaderField: "x-device-id")
        request.timeoutInterval = 10

        guard let (data, _) = try? await URLSession.shared.data(for: request),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let items = json["items"] as? [[String: Any]] else {
            return nil
        }

        for item in items {
            if let text = decrypt(item: item, masterKey: masterKey) { return text }
        }
        return nil
    }

    public func search(query: String) async -> [ClipboardEntity] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }
        return SharedCommandBridge.shared.cachedEntities()
            .filter { $0.title.localizedCaseInsensitiveContains(trimmed) }
    }

    // MARK: 删除

    public func delete(id: String) async -> Bool {
        guard let token = readKeychain("de.cloudclipboard.apikey.token") else { return false }
        guard let url = URL(string: baseURL.absoluteString + "/api/clipboard/\(id)") else { return false }
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 15
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { return false }
            return true
        } catch {
            return false
        }
    }

    // MARK: 内部

    /// Base URL：App Group 配置优先，回退到默认域名
    /// 默认 Worker 地址 = 现有 PWA 自定义域（见 apps/worker/wrangler.jsonc routes）
    private static let fallbackBaseURL = URL(string: "https://clip.0272.de5.net")

    private var baseURL: URL {
        let defaults = UserDefaults(suiteName: appGroupIdentifier) ?? .standard
        let stored = defaults.string(forKey: "shared.workerURL") ?? ""
        return URL(string: stored) ?? Self.fallbackBaseURL ?? URL(fileURLWithPath: "/")
    }

    private var deviceId: String {
        readKeychain("de.cloudclipboard.apikey.deviceid") ?? "ios-intents"
    }

    private var deviceName: String {
        readKeychain("de.cloudclipboard.apikey.devicename") ?? "iOS (Shortcuts)"
    }

    private func masterKey(phrase: String, userId: String) throws -> SymmetricKey {
        if let masterKeyCache { return masterKeyCache }
        let key = try crypto.deriveMasterKey(seedPhrase: phrase, userId: userId)
        masterKeyCache = key
        return key
    }

    private func decrypt(item: [String: Any], masterKey: SymmetricKey) -> String? {
        // plain = 1 的历史记录直接返回
        if let plain = item["plain"] as? Int, plain == 1, let raw = item["encrypted_data"] as? String {
            return raw
        }
        guard let encrypted = item["encrypted_data"] as? String,
              let iv = item["iv"] as? String,
              let wrapped = item["wrapped_key"] as? String,
              let salt = item["salt"] as? String else { return nil }
        return try? crypto.decryptClipboardContent(
            encrypted: encrypted,
            iv: iv,
            wrappedKey: wrapped,
            salt: salt,
            masterKey: masterKey
        )
    }

    private func inferType(_ content: String) -> ClipboardType {
        ClipboardType.infer(from: content)
    }

    /// 直接读 Keychain（Extension 与主 App 同 Team 同 service，可共享）
    private func readKeychain(_ account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecAttrSynchronizable as String: false,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
