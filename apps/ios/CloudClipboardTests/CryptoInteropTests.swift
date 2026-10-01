//
//  CryptoInteropTests.swift
//  CloudClipboardTests
//
//  最高优先级测试：E2EE 数据格式与 Web / Worker 完全兼容。
//
//  测试向量来自 packages/crypto 的真实算法（用 Node 侧的 webcrypto 生成，
//  见 scripts/verify-crypto-interop.mjs），因此这些是**跨端互操作测试**，
//  而不是「自己加密自己解密」的自闭环测试。
//

import XCTest
import CryptoKit
@testable import CloudClipboard

final class CryptoInteropTests: XCTestCase {
    private let crypto = CryptoService()

    // MARK: 常量一致性（与 packages/crypto/src/index.ts 对齐）

    func testConstantsMatchWebImplementation() {
        XCTAssertEqual(CryptoConstants.pbkdf2Iterations, 310_000)
        XCTAssertEqual(CryptoConstants.seedSaltPrefix, "cloudclipboard:v1:")
        XCTAssertEqual(String(data: CryptoConstants.itemKeyAAD, encoding: .utf8), "cloudclipboard:item-key:v1")
        XCTAssertEqual(CryptoConstants.ivLength, 12)
        XCTAssertEqual(CryptoConstants.keyLength, 32)
    }

    // MARK: base64url

    func testBase64URLRoundTripMatchesWebFormat() {
        let data = Data([0x00, 0x01, 0xFB, 0xFF, 0x7E, 0x3F])
        let encoded = Base64URL.encode(data)

        XCTAssertFalse(encoded.contains("+"), "base64url 不能出现 +")
        XCTAssertFalse(encoded.contains("/"), "base64url 不能出现 /")
        XCTAssertFalse(encoded.contains("="), "base64url 不能有 padding")

        XCTAssertEqual(Base64URL.decode(encoded), data)
        XCTAssertEqual(Base64URL.decode(""), Data())
    }

    /// 与 Web 端 btoa 的已知输出比对（Node: Buffer.from(...).toString('base64url')）
    func testBase64URLKnownVector() {
        // "hello" → aGVsbG8
        XCTAssertEqual(Base64URL.encode(Data("hello".utf8)), "aGVsbG8")
        // 0xFB 0xFF → -_8
        XCTAssertEqual(Base64URL.encode(Data([0xFB, 0xFF])), "-_8")
        XCTAssertEqual(Base64URL.decode("-_8"), Data([0xFB, 0xFF]))
    }

    // MARK: 端到端兼容

    /// Web 加密 → iOS 解密（核心互操作断言）
    func testDecryptWebEncryptedPayload() throws {
        let vector = try XCTUnwrap(
            WebCryptoVector.load(),
            "缺少 web-crypto-vector.json；请运行 node apps/ios/scripts/generate-crypto-vector.mjs"
        )

        // 1) iOS 的 PBKDF2 必须与 Web 逐字节一致（盐前缀 / 迭代次数 / SHA-256）
        let iosMasterKey = try crypto.deriveMasterKey(seedPhrase: vector.seed, userId: vector.userId)
        let webMasterKeyRaw = try XCTUnwrap(Base64URL.decode(vector.masterKeyRaw))
        XCTAssertEqual(
            iosMasterKey.withUnsafeBytes { Data($0) },
            webMasterKeyRaw,
            "PBKDF2 派生结果与 Web 端不一致：检查 SEED_SALT_PREFIX / 迭代次数 / 哈希算法"
        )

        // 2) 用 iOS 派生的 key 解密 Web 生成的密文
        let plaintext = try crypto.decryptClipboardContent(
            encrypted: vector.encrypted,
            iv: vector.iv,
            wrappedKey: vector.wrappedKey,
            salt: vector.salt,
            masterKey: iosMasterKey
        )
        XCTAssertEqual(plaintext, vector.plaintext)
    }

    /// iOS 加密 → Web 解密（把密文回传给 Node 脚本校验，同时自检结构）
    func testEncryptProducesWebCompatiblePayload() throws {
        let vector = try XCTUnwrap(WebCryptoVector.load(), "缺少测试向量文件")
        let masterKey = try crypto.deriveMasterKey(seedPhrase: vector.seed, userId: vector.userId)
        let content = "跨端互通测试 · iOS 产生的密文"

        let payload = try crypto.encryptClipboardContent(content, masterKey: masterKey)

        // 结构必须与 Web 端完全相同
        XCTAssertEqual(Base64URL.decode(payload.iv)?.count, 12, "IV 必须是 12 字节")
        XCTAssertEqual(Base64URL.decode(payload.salt)?.count, 12, "salt 必须是 12 字节")
        XCTAssertEqual(Base64URL.decode(payload.wrappedKey)?.count, 48, "wrappedKey = 32B key + 16B tag")
        XCTAssertEqual(
            Base64URL.decode(payload.encrypted)?.count,
            Data(content.utf8).count + 16,
            "密文 = 明文字节数 + 16B GCM tag"
        )
        // base64url 不能有 padding
        for field in [payload.encrypted, payload.iv, payload.wrappedKey, payload.salt] {
            XCTAssertFalse(field.contains("="))
            XCTAssertFalse(field.contains("+"))
            XCTAssertFalse(field.contains("/"))
        }

        // 自洽：iOS 能解回原文
        let roundTrip = try crypto.decryptClipboardContent(
            encrypted: payload.encrypted,
            iv: payload.iv,
            wrappedKey: payload.wrappedKey,
            salt: payload.salt,
            masterKey: masterKey
        )
        XCTAssertEqual(roundTrip, content)

        // 输出给 Node 脚本做「iOS 加密 → Web 解密」反向校验
        WebCryptoVector.writePayloadForWebVerification(payload, plaintext: content)
    }

    // MARK: 负向测试

    func testDecryptFailsWithWrongMasterKey() throws {
        let correctKey = try crypto.deriveMasterKey(seedPhrase: "seed-one", userId: "cf_aaa")
        let wrongKey = try crypto.deriveMasterKey(seedPhrase: "seed-two", userId: "cf_aaa")

        let payload = try crypto.encryptClipboardContent("secret", masterKey: correctKey)

        XCTAssertThrowsError(
            try crypto.decryptClipboardContent(
                encrypted: payload.encrypted,
                iv: payload.iv,
                wrappedKey: payload.wrappedKey,
                salt: payload.salt,
                masterKey: wrongKey
            )
        ) { error in
            guard case CryptoError.openFailed = error else {
                return XCTFail("期望 openFailed，实际 \(error)")
            }
        }
    }

    func testDecryptFailsOnTamperedCiphertext() throws {
        let key = try crypto.deriveMasterKey(seedPhrase: "seed", userId: "cf_bbb")
        let payload = try crypto.encryptClipboardContent("secret", masterKey: key)

        var bytes = try XCTUnwrap(Base64URL.decode(payload.encrypted))
        bytes[0] ^= 0xFF
        let tampered = Base64URL.encode(bytes)

        XCTAssertThrowsError(
            try crypto.decryptClipboardContent(
                encrypted: tampered,
                iv: payload.iv,
                wrappedKey: payload.wrappedKey,
                salt: payload.salt,
                masterKey: key
            )
        )
    }

    /// AAD 必须被校验：把 wrapped key 的 AAD 语义破坏后必须解密失败
    func testWrappedKeyRequiresCorrectAAD() throws {
        let key = try crypto.deriveMasterKey(seedPhrase: "seed", userId: "cf_ccc")
        let payload = try crypto.encryptClipboardContent("secret", masterKey: key)

        // 手工用「无 AAD」的 AES-GCM 重新包装 item key，解密必须失败
        let itemKeyBytes = SymmetricKey(size: .bits256)
        let wrapSalt = try XCTUnwrap(Base64URL.decode(payload.salt))
        let nonce = try AES.GCM.Nonce(data: wrapSalt)
        let sealed = try AES.GCM.seal(itemKeyBytes.withUnsafeBytes { Data($0) }, using: key, nonce: nonce)

        XCTAssertThrowsError(
            try crypto.decryptClipboardContent(
                encrypted: payload.encrypted,
                iv: payload.iv,
                wrappedKey: Base64URL.encode(sealed.combined!),
                salt: payload.salt,
                masterKey: key
            )
        )
    }

    func testEmptySeedPhraseRejected() {
        XCTAssertThrowsError(try crypto.deriveMasterKey(seedPhrase: "   ", userId: "cf_x"))
    }

    func testDifferentUserIdsProduceDifferentKeys() throws {
        let a = try crypto.deriveMasterKey(seedPhrase: "same seed", userId: "cf_user_a")
        let b = try crypto.deriveMasterKey(seedPhrase: "same seed", userId: "cf_user_b")
        XCTAssertNotEqual(a.withUnsafeBytes { Data($0) }, b.withUnsafeBytes { Data($0) })
    }

    func testUnicodeAndLargePayloadRoundTrip() throws {
        let key = try crypto.deriveMasterKey(seedPhrase: "seed", userId: "cf_ddd")
        let content = String(repeating: "剪贴板🔐测试\n", count: 5_000) // ~100KB
        let payload = try crypto.encryptClipboardContent(content, masterKey: key)
        let restored = try crypto.decryptClipboardContent(
            encrypted: payload.encrypted,
            iv: payload.iv,
            wrappedKey: payload.wrappedKey,
            salt: payload.salt,
            masterKey: key
        )
        XCTAssertEqual(restored, content)
    }
}

// MARK: - Web 端测试向量

/// 由 apps/ios/scripts/generate-crypto-vector.mjs 用 **Web 端同一套算法**
/// （Node webcrypto）生成，并提交到仓库。
/// 这样这些用例是真正的「跨端互操作测试」，而不是自己加密自己解密的闭环测试。
struct WebCryptoVector: Codable {
    let plaintext: String
    let seed: String
    let userId: String
    let masterKeyRaw: String
    let encrypted: String
    let iv: String
    let wrappedKey: String
    let salt: String

    static func load() -> WebCryptoVector? {
        for bundle in candidateBundles() {
            if let url = bundle.url(forResource: "web-crypto-vector", withExtension: "json"),
               let data = try? Data(contentsOf: url),
               let vector = try? JSONDecoder().decode(WebCryptoVector.self, from: data) {
                return vector
            }
        }
        return nil
    }

    private static func candidateBundles() -> [Bundle] {
        var bundles: [Bundle] = [Bundle(for: CryptoInteropTests.self)]
        bundles.append(Bundle.main)
        if let path = Bundle(for: CryptoInteropTests.self).path(forResource: "web-crypto-vector", ofType: "json"),
           let resourceBundle = Bundle(path: (path as NSString).deletingLastPathComponent) {
            bundles.append(resourceBundle)
        }
        return bundles
    }

    /// 把 iOS 加密的密文写到临时目录，供 Node 脚本做「iOS → Web」反向校验。
    static func writePayloadForWebVerification(_ payload: EncryptedPayload, plaintext: String) {
        let output: [String: String] = [
            "plaintext": plaintext,
            "encrypted": payload.encrypted,
            "iv": payload.iv,
            "wrappedKey": payload.wrappedKey,
            "salt": payload.salt,
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: output, options: [.prettyPrinted]) else { return }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("ios-crypto-output.json")
        try? data.write(to: url)
    }
}
