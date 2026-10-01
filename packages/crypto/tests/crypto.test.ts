import { describe, it, expect } from "vitest"
import {
  base64UrlEncode,
  base64UrlDecode,
  base64Encode,
  base64Decode,
  encrypt,
  decrypt,
  generateEncryptionKey,
  exportKey,
  importKey,
  encryptClipboardContent,
  decryptClipboardContent,
  deriveMasterKeyFromSeed,
  sha256Hex,
} from "../src/index"

describe("E2EE 加密模块（§66）", () => {
  it("base64url round-trip", () => {
    const data = new Uint8Array([1, 2, 3, 4, 255, 254])
    const encoded = base64UrlEncode(data)
    const decoded = base64UrlDecode(encoded)
    expect(Array.from(decoded)).toEqual(Array.from(data))
  })

  it("base64 round-trip", () => {
    const data = new Uint8Array([10, 20, 30, 40, 200])
    const encoded = base64Encode(data)
    const decoded = base64Decode(encoded)
    expect(Array.from(decoded)).toEqual(Array.from(data))
  })

  it("AES-256-GCM encrypt/decrypt round-trip", async () => {
    const key = await generateEncryptionKey()
    const plaintext = "Hello CloudClipboard!"
    const { encrypted, iv } = await encrypt(plaintext, key)
    const decrypted = await decrypt(encrypted, iv, key)
    expect(decrypted).toBe(plaintext)
  })

  it("不同 key 无法解密（wrong key）", async () => {
    const key1 = await generateEncryptionKey()
    const key2 = await generateEncryptionKey()
    const { encrypted, iv } = await encrypt("secret message", key1)
    await expect(decrypt(encrypted, iv, key2)).rejects.toThrow()
  })

  it("tampered ciphertext 必须失败（§66）", async () => {
    const key = await generateEncryptionKey()
    const { encrypted, iv } = await encrypt("integrity check", key)
    // 篡改密文最后一个字符
    const tampered = encrypted.slice(0, -1) + (encrypted.endsWith("A") ? "B" : "A")
    await expect(decrypt(tampered, iv, key)).rejects.toThrow()
  })

  it("tampered IV 必须失败（§66）", async () => {
    const key = await generateEncryptionKey()
    const { encrypted, iv } = await encrypt("iv integrity", key)
    const tamperedIv = iv.slice(0, -1) + (iv.endsWith("A") ? "B" : "A")
    await expect(decrypt(encrypted, tamperedIv, key)).rejects.toThrow()
  })

  it("每次加密产生不同 IV", async () => {
    const key = await generateEncryptionKey()
    const { iv: iv1 } = await encrypt("test", key)
    const { iv: iv2 } = await encrypt("test", key)
    expect(iv1).not.toBe(iv2)
  })

  it("空字符串加密", async () => {
    const key = await generateEncryptionKey()
    const { encrypted, iv } = await encrypt("", key)
    const decrypted = await decrypt(encrypted, iv, key)
    expect(decrypted).toBe("")
  })

  it("中文字符加密", async () => {
    const key = await generateEncryptionKey()
    const plaintext = "中文测试内容 跨设备同步 ✓"
    const { encrypted, iv } = await encrypt(plaintext, key)
    const decrypted = await decrypt(encrypted, iv, key)
    expect(decrypted).toBe(plaintext)
  })

  it("key export/import round-trip", async () => {
    const key = await generateEncryptionKey()
    const exported = await exportKey(key)
    const imported = await importKey(exported)
    const { encrypted, iv } = await encrypt("key portability", key)
    const decrypted = await decrypt(encrypted, iv, imported)
    expect(decrypted).toBe("key portability")
  })

  it("item 级加密（wrapped key）round-trip", async () => {
    const masterKey = await generateEncryptionKey()
    const plaintext = "跨设备 master key 包装测试"
    const { encrypted, iv, wrappedKey, salt } = await encryptClipboardContent(plaintext, masterKey)
    const decrypted = await decryptClipboardContent(encrypted, iv, wrappedKey, salt, masterKey)
    expect(decrypted).toBe(plaintext)
  })

  it("item 级加密：wrong master key 无法解密", async () => {
    const masterKey1 = await generateEncryptionKey()
    const masterKey2 = await generateEncryptionKey()
    const { encrypted, iv, wrappedKey, salt } = await encryptClipboardContent("wrong master key", masterKey1)
    await expect(decryptClipboardContent(encrypted, iv, wrappedKey, salt, masterKey2)).rejects.toThrow()
  })

  it("种子短语派生：相同短语 + 相同 userId → 相同 key", async () => {
    const seed = "我的秘密生活密码123"
    const userId = "cf_abc123"
    const key1 = await deriveMasterKeyFromSeed(seed, userId)
    const key2 = await deriveMasterKeyFromSeed(seed, userId)
    const k1 = await exportKey(key1)
    const k2 = await exportKey(key2)
    expect(k1).toBe(k2)
  })

  it("种子短语派生：相同短语 + 不同 userId → 不同 key", async () => {
    const seed = "我的秘密生活密码123"
    const key1 = await deriveMasterKeyFromSeed(seed, "cf_user1")
    const key2 = await deriveMasterKeyFromSeed(seed, "cf_user2")
    const k1 = await exportKey(key1)
    const k2 = await exportKey(key2)
    expect(k1).not.toBe(k2)
  })

  it("种子短语派生：不同短语 + 相同 userId → 不同 key", async () => {
    const key1 = await deriveMasterKeyFromSeed("短语A正确吗", "cf_user1")
    const key2 = await deriveMasterKeyFromSeed("短语B完全不一样", "cf_user1")
    const k1 = await exportKey(key1)
    const k2 = await exportKey(key2)
    expect(k1).not.toBe(k2)
  })

  it("种子短语派生：种子短语可加解密 item 数据", async () => {
    const seed = "my-secret-phrase-测试"
    const userId = "cf_demo_user"
    const masterKey = await deriveMasterKeyFromSeed(seed, userId)
    const plaintext = "用种子短语加密的内容"
    const { encrypted, iv, wrappedKey, salt } = await encryptClipboardContent(plaintext, masterKey)
    const decrypted = await decryptClipboardContent(encrypted, iv, wrappedKey, salt, masterKey)
    expect(decrypted).toBe(plaintext)
  })

  it("种子短语为空抛出错误", async () => {
    await expect(deriveMasterKeyFromSeed("  ", "cf_user1")).rejects.toThrow()
  })

  it("sha256Hex 一致性", async () => {
    const h1 = await sha256Hex("cloudclipboard")
    const h2 = await sha256Hex("cloudclipboard")
    expect(h1).toBe(h2)
    expect(h1).toHaveLength(64)
  })

  // ── curl passphrase E2EE 模式（/api/clipboard/plain + passphrase） ──

  it("passphrase E2EE：服务器用 passphrase 加密，前端可用相同 passphrase 解密", async () => {
    const seed = "my-curl-passphrase-123"
    const userId = "cf_apiuser123"
    const content = "curl 上传的内容"

    // 模拟服务器：用 passphrase + userId 派生 master key 并加密
    const masterKey = await deriveMasterKeyFromSeed(seed, userId)
    const { encrypted, iv, wrappedKey, salt } = await encryptClipboardContent(content, masterKey)

    // 模拟前端：用相同 passphrase 解密
    const clientMasterKey = await deriveMasterKeyFromSeed(seed, userId)
    const decrypted = await decryptClipboardContent(encrypted, iv, wrappedKey, salt, clientMasterKey)
    expect(decrypted).toBe(content)
  })

  it("passphrase E2EE：错误 passphrase 无法解密", async () => {
    const seed1 = "correct-passphrase-123"
    const seed2 = "wrong-passphrase-456"
    const userId = "cf_apiuser123"
    const content = "机密内容"

    const masterKey = await deriveMasterKeyFromSeed(seed1, userId)
    const { encrypted, iv, wrappedKey, salt } = await encryptClipboardContent(content, masterKey)

    const wrongKey = await deriveMasterKeyFromSeed(seed2, userId)
    await expect(decryptClipboardContent(encrypted, iv, wrappedKey, salt, wrongKey)).rejects.toThrow()
  })

  it("passphrase E2EE：密文包含 wrapped_key + salt（plain=0 格式）", async () => {
    const seed = "my-curl-passphrase-123"
    const userId = "cf_apiuser123"
    const content = "需要 E2EE 的内容"

    const masterKey = await deriveMasterKeyFromSeed(seed, userId)
    const { encrypted, iv, wrappedKey, salt } = await encryptClipboardContent(content, masterKey)

    expect(encrypted).toBeTruthy()
    expect(iv).toBeTruthy()
    expect(wrappedKey).toBeTruthy()
    expect(salt).toBeTruthy()
    expect(encrypted).not.toContain(content) // 密文不含明文
  })
})
