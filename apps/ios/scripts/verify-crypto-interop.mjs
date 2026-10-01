#!/usr/bin/env node
/**
 * verify-crypto-interop.mjs
 *
 * 双向互通验证的 Web 侧：
 *   1) 读取 iOS 测试写出的 ios-crypto-output.json（iOS 加密的密文）
 *   2) 用与 packages/crypto 相同的算法解密，验证 iOS → Web 兼容
 *
 * 用法（CI 中在 xcodebuild test 之后执行）：
 *   node apps/ios/scripts/verify-crypto-interop.mjs [path/to/ios-crypto-output.json]
 */

import { webcrypto as crypto } from "node:crypto"
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { tmpdir } from "node:os"

const PBKDF2_ITERATIONS = 310_000
const SEED_SALT_PREFIX = "cloudclipboard:v1:"
const ITEM_KEY_AAD = "cloudclipboard:item-key:v1"
const SEED = "correct horse battery staple cloudclipboard"
const USER_ID = "cf_0123456789abcdef0123456789abcdef"

const fromB64url = (s) =>
  Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "="), "base64")

const path = process.argv[2] ?? resolve(tmpdir(), "ios-crypto-output.json")
if (!existsSync(path)) {
  console.log(`⚠ 未找到 iOS 输出文件 ${path}，跳过 iOS → Web 互通验证`)
  process.exit(0)
}

const output = JSON.parse(readFileSync(path, "utf8"))

const baseKey = await crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(SEED),
  "PBKDF2",
  false,
  ["deriveKey"]
)
const masterKey = await crypto.subtle.deriveKey(
  {
    name: "PBKDF2",
    hash: "SHA-256",
    salt: new TextEncoder().encode(SEED_SALT_PREFIX + USER_ID),
    iterations: PBKDF2_ITERATIONS,
  },
  baseKey,
  { name: "AES-GCM", length: 256 },
  false,
  ["decrypt"]
)

const itemKeyRaw = await crypto.subtle.decrypt(
  {
    name: "AES-GCM",
    iv: fromB64url(output.salt),
    tagLength: 128,
    additionalData: new TextEncoder().encode(ITEM_KEY_AAD),
  },
  masterKey,
  fromB64url(output.wrappedKey)
)

const itemKey = await crypto.subtle.importKey("raw", itemKeyRaw, { name: "AES-GCM" }, false, ["decrypt"])
const decrypted = await crypto.subtle.decrypt(
  { name: "AES-GCM", iv: fromB64url(output.iv), tagLength: 128 },
  itemKey,
  fromB64url(output.encrypted)
)

const plaintext = new TextDecoder().decode(decrypted)
if (plaintext !== output.plaintext) {
  console.error("✖ iOS → Web 互通验证失败：解密结果与原文不一致")
  console.error("  期望:", JSON.stringify(output.plaintext))
  console.error("  实际:", JSON.stringify(plaintext))
  process.exit(1)
}

console.log("✓ iOS → Web E2EE 互通验证通过")
