//
//  KeychainService.swift
//  CloudClipboard
//
//  所有敏感数据统一走 Keychain（禁止 UserDefaults）。
//  保存内容：
//    - API Token（cca_...）
//    - 种子短语（用于派生 master key，绝不落盘明文到文件系统）
//    - master key 原始字节（可选缓存，减少 PBKDF2 310k 次迭代的耗时）
//    - deviceId / userId
//
//  可访问性：kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
//    - AfterFirstUnlock：允许后台任务 / Share Extension 在锁屏后读取（同步需要）
//    - ThisDeviceOnly：不参与 iCloud 钥匙串备份与设备迁移，避免密钥外泄
//

import Foundation
import Security

public enum KeychainKey: String, CaseIterable, Sendable {
    case apiToken = "de.cloudclipboard.apikey.token"
    case seedPhrase = "de.cloudclipboard.apikey.seed"
    case masterKey = "de.cloudclipboard.apikey.masterkey"
    case deviceId = "de.cloudclipboard.apikey.deviceid"
    case userId = "de.cloudclipboard.apikey.userid"
    case deviceName = "de.cloudclipboard.apikey.devicename"
    /// Cloudflare Access JWT（CF_Authorization cookie 的值，短期有效）
    case accessJwt = "de.cloudclipboard.apikey.accessjwt"
    /// 上次登录方式："access" | "token"
    case authMethod = "de.cloudclipboard.apikey.authmethod"
}

public protocol KeychainServiceProtocol: Sendable {
    public func set(_ value: String, for key: KeychainKey) throws
    public func get(_ key: KeychainKey) -> String?
    public func remove(_ key: KeychainKey)
    public func removeAll()
    public func hasKeychainBackedSeed() -> Bool
}

public struct KeychainService: KeychainServiceProtocol {
    private let service: String

    public init(service: String = "de.cloudclipboard.credentials") {
        self.service = service
    }

    // MARK: 写

    public func set(_ value: String, for key: KeychainKey) throws {
        guard let data = value.data(using: .utf8) else {
            throw KeychainError.encodingFailed
        }

        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue,
        ]

        // 先删后写：SecItemUpdate 在某些模拟器/重置场景下会返回 errSecItemNotFound
        SecItemDelete(query as CFDictionary)

        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        query[kSecAttrSynchronizable as String] = false

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.unexpectedStatus(status)
        }
    }

    // MARK: 读

    public func get(_ key: KeychainKey) -> String? {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        query[kSecAttrSynchronizable as String] = false

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    // MARK: 删

    public func remove(_ key: KeychainKey) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue,
        ]
        SecItemDelete(query as CFDictionary)
    }

    public func removeAll() {
        KeychainKey.allCases.forEach(remove)
    }

    /// 是否已存在由种子短语派生的 master key（用于判断是否需要引导用户输入短语）
    public func hasKeychainBackedSeed() -> Bool {
        get(.seedPhrase) != nil
    }
}

public enum KeychainError: Error, LocalizedError, Equatable {
    case encodingFailed
    case unexpectedStatus(OSStatus)

    public var errorDescription: String? {
        switch self {
        case .encodingFailed:
            return "无法把凭据编码为 UTF-8"
        case .unexpectedStatus(let status):
            let message = SecCopyErrorMessageString(status, nil) as String? ?? "未知错误"
            return "钥匙串写入失败：\(message)"
        }
    }
}
