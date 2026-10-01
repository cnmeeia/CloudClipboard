//
//  CryptoService.swift
//  CloudClipboard
//
//  E2EE 加密核心（最高优先级：必须与 Web / Worker 完全兼容）
//
//  与 `packages/crypto/src/index.ts` 的对应关系（逐字段核对）：
//
//    masterKey = PBKDF2-SHA256(seedPhrase,
//                              salt = "cloudclipboard:v1:" + userId,
//                              iterations = 310_000, keyLength = 32)
//
//    加密条目：
//      itemKey              = 随机 32 字节 AES key
//      (ciphertext||tag),iv = AES-256-GCM(itemKey, plaintext)   // iv 12 随机字节, tag 16 字节
//      wrappedKey           = AES-256-GCM(masterKey, itemKeyRaw,
//                                  iv = salt(12 随机字节),
//                                  aad = "cloudclipboard:item-key:v1")
//
//  注意：WebCrypto 的 AES-GCM `encrypt()` 返回 `ciphertext || authTag`，
//  CryptoKit 的 `AES.GCM.seal` 也把 tag 拼在 `ciphertext` 之后，字节序完全一致，
//  因此不需要手工重排。
//

import Foundation
import CryptoKit
import CommonCrypto

// MARK: - 常量（必须与 packages/crypto 保持一致）

public enum CryptoConstants {
    /// PBKDF2 迭代次数（OWASP 推荐 ≥310k），Web/Worker/iOS 必须相同
    public static let pbkdf2Iterations: UInt32 = 310_000
    /// 派生盐前缀 —— 以 packages/crypto/src/index.ts 的 SEED_SALT_PREFIX 为准
    public static let seedSaltPrefix = "cloudclipboard:v1:"
    /// item key 包装时使用的 AAD
    public static let itemKeyAAD = Data("cloudclipboard:item-key:v1".utf8)
    /// AES-GCM IV 长度（96 bit）
    public static let ivLength = 12
    /// AES-256 密钥长度
    public static let keyLength = 32
}

// MARK: - 错误

public enum CryptoError: Error, LocalizedError, Equatable {
    case emptySeedPhrase
    case invalidKeyMaterial
    case invalidBase64(field: String)
    case keyDerivationFailed
    case sealFailed
    case openFailed(field: String)

    public var errorDescription: String? {
        switch self {
        case .emptySeedPhrase: return "种子短语不能为空"
        case .invalidKeyMaterial: return "密钥材料无效"
        case .invalidBase64(let field): return "\(field) 不是合法的 base64url 数据"
        case .keyDerivationFailed: return "密钥派生失败"
        case .sealFailed: return "加密失败"
        case .openFailed(let field): return "解密「\(field)」失败：密钥不匹配或数据损坏"
        }
    }
}

// MARK: - 密文包（与 API 字段一一对应）

/// 加密结果，字段名直接对应 API 的 snake_case（由 Encodable 策略转换）。
public struct EncryptedPayload: Sendable, Equatable {
    public let encrypted: String
    public let iv: String
    public let wrappedKey: String
    public let salt: String

    public init(encrypted: String, iv: String, wrappedKey: String, salt: String) {
        self.encrypted = encrypted
        self.iv = iv
        self.wrappedKey = wrappedKey
        self.salt = salt
    }
}

// MARK: - CryptoService

public protocol CryptoServiceProtocol: Sendable {
    func deriveMasterKey(seedPhrase: String, userId: String) throws -> SymmetricKey
    func encryptClipboardContent(_ plaintext: String, masterKey: SymmetricKey) throws -> EncryptedPayload
    func decryptClipboardContent(
        encrypted: String,
        iv: String,
        wrappedKey: String,
        salt: String,
        masterKey: SymmetricKey
    ) throws -> String
}

public struct CryptoService: CryptoServiceProtocol {
    public init() {}

    // MARK: 密钥派生

    /// PBKDF2-SHA256 → 32 字节主密钥。
    /// iOS 无原生 PBKDF2，使用 CommonCrypto 的 `CCKeyDerivationPBKDF`。
    public func deriveMasterKey(seedPhrase: String, userId: String) throws -> SymmetricKey {
        let normalized = seedPhrase.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else { throw CryptoError.emptySeedPhrase }

        let salt = Data((CryptoConstants.seedSaltPrefix + userId).utf8)
        let password = Data(normalized.utf8)

        var derived = [UInt8](repeating: 0, count: CryptoConstants.keyLength)
        let status = derived.withUnsafeMutableBytes { derivedPtr -> Int32 in
            password.withUnsafeBytes { passwordPtr -> Int32 in
                salt.withUnsafeBytes { saltPtr -> Int32 in
                    CCKeyDerivationPBKDF(
                        CCPBKDFAlgorithm(kCCPBKDF2),
                        passwordPtr.bindMemory(to: Int8.self).baseAddress,
                        password.count,
                        saltPtr.bindMemory(to: UInt8.self).baseAddress,
                        salt.count,
                        CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256),
                        CryptoConstants.pbkdf2Iterations,
                        derivedPtr.bindMemory(to: UInt8.self).baseAddress,
                        CryptoConstants.keyLength
                    )
                }
            }
        }
        guard status == kCCSuccess else { throw CryptoError.keyDerivationFailed }

        // 用完立即清零派生字节（降低内存中被 dump 的风险）
        for index in derived.indices { derived[index] = 0 }
        return SymmetricKey(data: Data(derived))
    }

    // MARK: 加密

    public func encryptClipboardContent(
        _ plaintext: String,
        masterKey: SymmetricKey
    ) throws -> EncryptedPayload {
        // 1) 每条目独立随机 item key
        let itemKey = SymmetricKey(size: .bits256)

        // 2) 用 item key 加密明文（AES-256-GCM，96-bit 随机 IV，128-bit tag）
        let iv = randomBytes(CryptoConstants.ivLength)
        let nonce = try AES.GCM.Nonce(data: iv)
        let sealed = try seal(Data(plaintext.utf8), key: itemKey, nonce: nonce, aad: nil)

        // 3) 导出 item key 原始字节
        let itemKeyRaw = itemKey.withUnsafeBytes { Data($0) }

        // 4) 用 master key 包装 item key（AAD 与 Web 端完全一致）
        let wrapSalt = randomBytes(CryptoConstants.ivLength)
        let wrapNonce = try AES.GCM.Nonce(data: wrapSalt)
        let wrapped = try seal(itemKeyRaw, key: masterKey, nonce: wrapNonce, aad: CryptoConstants.itemKeyAAD)

        return EncryptedPayload(
            encrypted: Base64URL.encode(sealed),
            iv: Base64URL.encode(iv),
            wrappedKey: Base64URL.encode(wrapped),
            salt: Base64URL.encode(wrapSalt)
        )
    }

    // MARK: 解密

    public func decryptClipboardContent(
        encrypted: String,
        iv: String,
        wrappedKey: String,
        salt: String,
        masterKey: SymmetricKey
    ) throws -> String {
        guard let wrappedData = Base64URL.decode(wrappedKey) else {
            throw CryptoError.invalidBase64(field: "wrapped_key")
        }
        guard let saltData = Base64URL.decode(salt) else {
            throw CryptoError.invalidBase64(field: "salt")
        }
        guard let ivData = Base64URL.decode(iv) else {
            throw CryptoError.invalidBase64(field: "iv")
        }
        guard let cipherData = Base64URL.decode(encrypted) else {
            throw CryptoError.invalidBase64(field: "encrypted_data")
        }

        // 1) 用 master key 解包 item key
        let itemKeyRaw: Data
        do {
            let box = try splitCombined(wrappedData, field: "wrapped_key", nonce: saltData)
            itemKeyRaw = try AES.GCM.open(box, using: masterKey, authenticating: CryptoConstants.itemKeyAAD)
        } catch let error as CryptoError {
            throw error
        } catch {
            throw CryptoError.openFailed(field: "wrapped_key（主密钥不匹配或数据损坏）")
        }

        // 2) 用 item key 解密密文
        let itemKey = SymmetricKey(data: itemKeyRaw)
        do {
            let box = try splitCombined(cipherData, field: "encrypted_data", nonce: ivData)
            let plaintext = try AES.GCM.open(box, using: itemKey)
            guard let string = String(data: plaintext, encoding: .utf8) else {
                throw CryptoError.openFailed(field: "encrypted_data（不是合法 UTF-8）")
            }
            return string
        } catch let error as CryptoError {
            throw error
        } catch {
            throw CryptoError.openFailed(field: "encrypted_data")
        }
    }

    // MARK: 内部工具

    /// 加密并返回 `ciphertext||tag`（与 WebCrypto 输出一致）
    /// AES-GCM 密封，返回 `ciphertext || tag`（与 WebCrypto `encrypt()` 输出一致）。
    private func seal(_ data: Data, key: SymmetricKey, nonce: AES.GCM.Nonce, aad: Data?) throws -> Data {
        do {
            let box: AES.GCM.SealedBox
            if let aad {
                box = try AES.GCM.seal(data, using: key, nonce: nonce, authenticating: aad)
            } else {
                box = try AES.GCM.seal(data, using: key, nonce: nonce)
            }
            // combined = nonce(12) || ciphertext || tag(16)
            // WebCrypto 的 encrypt() 输出只有 ciphertext || tag，因此剥离前缀 nonce。
            return box.ciphertext + box.tag
        } catch let error as CryptoError {
            throw error
        } catch {
            throw CryptoError.sealFailed
        }
    }

    /// 把 `ciphertext || tag` 拆回 SealedBox 所需的 ciphertext + tag
    private func splitCombined(_ data: Data, field: String, nonce: Data) throws -> AES.GCM.SealedBox {
        guard data.count > Self.gcmTagLength else {
            throw CryptoError.invalidBase64(field: "\\(field)（长度不足，至少需要 tag 的 16 字节）")
        }
        do {
            return try AES.GCM.SealedBox(
                nonce: AES.GCM.Nonce(data: nonce),
                ciphertext: data.prefix(data.count - Self.gcmTagLength),
                tag: data.suffix(Self.gcmTagLength)
            )
        } catch {
            throw CryptoError.openFailed(field: field)
        }
    }

    /// GCM auth tag 长度（128 bit）
    private static let gcmTagLength = 16

    /// 密码学安全随机字节（使用 SecRandomCopyBytes，非 Int.random）
    private func randomBytes(_ count: Int) -> Data {
        var bytes = [UInt8](repeating: 0, count: count)
        let status = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
        if status != errSecSuccess {
            // 兜底：CryptoKit 随机源（同为 CSPRNG）
            bytes = Array(SymmetricKey(size: .bits256).withUnsafeBytes { Data($0) }.prefix(count))
        }
        return Data(bytes)
    }
}
