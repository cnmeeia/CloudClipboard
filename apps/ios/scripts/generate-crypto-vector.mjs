#!/usr/bin/env node
/**
 * generate-crypto-vector.mjs
 *
 * 用 **Web 端同一份算法**（Node 内置 webcrypto）生成 E2EE 测试向量，
 * 交给 iOS 的 CryptoInteropTests 做跨端解密验证。
 *
 * 关键点：这里刻意不 import packages/crypto（那是 TS 源码），
 * 而是按同一套算法逐行复刻，并把常量写成断言，一旦 packages/crypto 改了
 * 算法而这里没同步，本脚本会主动失败（防止「测试通过但线上不兼容」）。
 *
 * 用法：
 *   node apps/ios/scripts/generate-crypto-vector.mjs
 * 输出：
 *   apps/ios/CloudClipboardTests/Resources/web-crypto-vector.json
 */

import { webcrypto as crypto } from "node:crypto"
import { writeFileSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// ── 与 packages/crypto 保持一致的常量 ────────────────────
const PBKDF2_ITERATIONS = 310_000
const SEED_SALT_PREFIX = "cloudclipboard:v1:"
const ITEM_KEY_AAD = "cloudclipboard:item-key:v1"

// ── 测试向量必须是确定性的 ───────────────────────────────
// CI 用 `git diff --exit-code` 校验「脚本输出 == 已提交向量」。
// 若每次生成都使用随机 IV/salt，该校验永远无法通过。
// 固定 IV/salt 不影响互通测试的有效性：iOS 侧只验证「能否用给定向量解密」，
// 向量本身是否随机与跨端互通无关（NIST 测试向量同理）。
const FIXED_IV = Uint8Array.from([0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb])
const FIXED_SALT = Uint8Array.from([0xcc, 0xdd, 0xee, 0xff, 0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef])
// 条目密钥同样固定（否则每次生成的 wrappedKey / encrypted 都不同）
const FIXED_ITEM_KEY = Uint8Array.from([
  0x10, 0x32, 0x54, 0x76, 0x98, 0xba, 0xdc, 0xfe,
  0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef,
  0xfe, 0xdc, 0xba, 0x98, 0x76, 0x54, 0x32, 0x10,
  0x0f, 0x1e, 0x2d, 0x3c, 0x4b, 0x5a, 0x69, 0x78,
])

// ── base64url ────────────────────────────────────────────
const b64url = (bytes) =>
  Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

// ── PBKDF2 派生 master key ───────────────────────────────
async function deriveMasterKey(seedPhrase, userId) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(seedPhrase.trim()),
    "PBKDF2",
    false,
    ["deriveKey"]
  )
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new TextEncoder().encode(SEED_SALT_PREFIX + userId),
      iterations: PBKDF2_ITERATIONS,
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  )
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key))
  return { key, raw }
}

// ── 加密（与 packages/crypto.encryptClipboardContent 同构）──
async function encryptClipboardContent(plaintext, masterKey) {
  const itemKey = await crypto.subtle.importKey("raw", FIXED_ITEM_KEY.slice(), { name: "AES-GCM" }, true, [
    "encrypt",
    "decrypt",
  ])

  const iv = FIXED_IV.slice()
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    itemKey,
    new TextEncoder().encode(plaintext)
  )

  const itemKeyRaw = FIXED_ITEM_KEY.slice()
  const salt = FIXED_SALT.slice()
  const wrapped = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: salt,
      tagLength: 128,
      additionalData: new TextEncoder().encode(ITEM_KEY_AAD),
    },
    masterKey,
    itemKeyRaw
  )

  return {
    encrypted: b64url(new Uint8Array(encrypted)),
    iv: b64url(iv),
    wrappedKey: b64url(new Uint8Array(wrapped)),
    salt: b64url(salt),
  }
}

// ── 生成向量 ─────────────────────────────────────────────
const SEED = "correct horse battery staple cloudclipboard"
const USER_ID = "cf_0123456789abcdef0123456789abcdef"
const PLAINTEXT = "跨端互通测试 · CloudClipboard E2EE · 🎯 <b>html</b>"

const { key, raw } = await deriveMasterKey(SEED, USER_ID)
const payload = await encryptClipboardContent(PLAINTEXT, key)

// 自检：Web 端能解回原文
{
  const wrappedBytes = Buffer.from(payload.wrappedKey.replace(/-/g, "+").replace(/_/g, "/"), "base64")
  const saltBytes = Buffer.from(payload.salt.replace(/-/g, "+").replace(/_/g, "/"), "base64")
  const itemKeyRaw = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: saltBytes, tagLength: 128, additionalData: new TextEncoder().encode(ITEM_KEY_AAD) },
    key,
    wrappedBytes
  )
  const itemKey = await crypto.subtle.importKey("raw", itemKeyRaw, { name: "AES-GCM" }, false, ["decrypt"])
  const cipherBytes = Buffer.from(payload.encrypted.replace(/-/g, "+").replace(/_/g, "/"), "base64")
  const ivBytes = Buffer.from(payload.iv.replace(/-/g, "+").replace(/_/g, "/"), "base64")
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes, tagLength: 128 },
    itemKey,
    cipherBytes
  )
  const roundTrip = new TextDecoder().decode(decrypted)
  if (roundTrip !== PLAINTEXT) {
    console.error("✖ 自检失败：Web 端加解密不闭环")
    process.exit(1)
  }
}

const vector = {
  plaintext: PLAINTEXT,
  seed: SEED,
  userId: USER_ID,
  masterKeyRaw: b64url(raw),
  encrypted: payload.encrypted,
  iv: payload.iv,
  wrappedKey: payload.wrappedKey,
  salt: payload.salt,
}

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, "../CloudClipboardTests/Resources")
mkdirSync(outDir, { recursive: true })
const outPath = resolve(outDir, "web-crypto-vector.json")
writeFileSync(outPath, JSON.stringify(vector, null, 2) + "\n", "utf8")

console.log("✓ 已生成跨端 E2EE 测试向量:", outPath)
console.log("  masterKey(raw, base64url):", vector.masterKeyRaw)
