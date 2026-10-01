/**
 * CloudClipboard E2EE 加密核心
 *
 * 安全模型（Zero Plaintext）：
 * - 每个 clipboard item 使用独立随机 AES-256-GCM key + 96-bit IV
 * - item key 用设备 master key 包装后，随密文一起存到服务器
 * - 服务器只保存 ciphertext + wrapped key + IV，永远看不到明文
 * - 跨设备：master key 通过配对流程（QR + OTP）在设备间安全交换
 *
 * 环境无关：浏览器 Web Crypto 与 Workers Web Crypto API 兼容，
 * Node 测试环境使用 node:crypto.webcrypto 作为全局 crypto。
 */

// ──────────────────────────────
// Base64 URL-safe 工具
// ──────────────────────────────

function bytesToBinary(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return binary
}

export function base64UrlEncode(data: Uint8Array): string {
  return btoa(bytesToBinary(data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/")
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function base64Encode(data: Uint8Array): string {
  return btoa(bytesToBinary(data))
}

export function base64Decode(str: string): Uint8Array {
  const binary = atob(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// ──────────────────────────────
// Key / IV 生成
// ──────────────────────────────

/** 生成随机 AES-256-GCM key */
export async function generateEncryptionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  )
}

/** 导出 CryptoKey → base64url string */
export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = (await crypto.subtle.exportKey("raw", key)) as ArrayBuffer
  return base64UrlEncode(new Uint8Array(raw))
}

/** 从 base64url string 导入 CryptoKey */
export async function importKey(base64Key: string): Promise<CryptoKey> {
  const raw = base64UrlDecode(base64Key)
  return (await crypto.subtle.importKey(
    "raw",
    raw.buffer as ArrayBuffer,
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  )) as CryptoKey
}

/** 生成随机 96-bit IV */
export function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(12))
}

// ──────────────────────────────
// AES-256-GCM 加解密
// ──────────────────────────────

export interface EncryptResult {
  encrypted: string
  iv: string
}

export async function encrypt(
  plaintext: string | Uint8Array,
  key: CryptoKey
): Promise<EncryptResult> {
  const data = typeof plaintext === "string"
    ? new TextEncoder().encode(plaintext)
    : plaintext

  const iv = generateIV()

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer, tagLength: 128 },
    key,
    data.buffer as ArrayBuffer
  )

  return {
    encrypted: base64UrlEncode(new Uint8Array(encrypted)),
    iv: base64UrlEncode(iv),
  }
}

export async function decrypt(
  encrypted: string,
  iv: string,
  key: CryptoKey
): Promise<string> {
  const encryptedBytes = base64UrlDecode(encrypted)
  const ivBytes = base64UrlDecode(iv)

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes.buffer as ArrayBuffer, tagLength: 128 },
    key,
    encryptedBytes.buffer as ArrayBuffer
  )

  return new TextDecoder().decode(decrypted)
}

// ──────────────────────────────
// Item 级加密（E2EE 核心流程）
// ──────────────────────────────

/**
 * 加密剪贴板内容：
 * 1. 生成随机 item key
 * 2. 用 item key 加密明文 → ciphertext + IV
 * 3. 用 master key 包装 item key → wrappedKey
 * 返回可直接上传服务器的密文包
 */
export async function encryptClipboardContent(
  plaintext: string,
  masterKey: CryptoKey
): Promise<{
  encrypted: string
  iv: string
  wrappedKey: string
  salt: string
}> {
  const itemKey = await generateEncryptionKey()
  const { encrypted, iv } = await encrypt(plaintext, itemKey)

  // 用 master key 包装 item key（AES-GCM key wrap，附带随机 salt 作为 AAD 标记）
  const itemKeyRaw = await crypto.subtle.exportKey("raw", itemKey)
  const salt = generateIV()
  const wrapped = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: salt.buffer as ArrayBuffer,
      tagLength: 128,
      additionalData: new TextEncoder().encode("cloudclipboard:item-key:v1"),
    },
    masterKey,
    itemKeyRaw
  )

  return {
    encrypted,
    iv,
    wrappedKey: base64UrlEncode(new Uint8Array(wrapped)),
    salt: base64UrlEncode(salt),
  }
}

/**
 * 解密剪贴板内容：
 * 1. 用 master key 解包 item key
 * 2. 用 item key 解密密文
 */
export async function decryptClipboardContent(
  encrypted: string,
  iv: string,
  wrappedKey: string,
  salt: string,
  masterKey: CryptoKey
): Promise<string> {
  // 解包 item key
  const wrappedBytes = base64UrlDecode(wrappedKey)
  const saltBytes = base64UrlDecode(salt)
  const itemKeyRaw = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: saltBytes.buffer as ArrayBuffer,
      tagLength: 128,
      additionalData: new TextEncoder().encode("cloudclipboard:item-key:v1"),
    },
    masterKey,
    wrappedBytes.buffer as ArrayBuffer
  )

  const itemKey = await crypto.subtle.importKey(
    "raw",
    itemKeyRaw,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  )

  return decrypt(encrypted, iv, itemKey)
}

// ──────────────────────────────
// Master Key（浏览器 IndexedDB 存储）
//
// 安全模型（路线 B — 种子短语派生，零知识）：
//   masterKey = PBKDF2(seedPhrase, salt="cloudclipboard:"+userId, iterations, SHA-256)
// - 种子短语只存在于浏览器，服务器永远见不到
// - 任何设备输入同一短语 + 同一 userId → 算出同一把 master key
// - 不需要导出/导入 key，换设备/清缓存后输入短语即可恢复
// ──────────────────────────────

const DB_NAME = "cloudclipboard"
const DB_VERSION = 4
const STORE_NAME = "keys"
const SECURE_STORE_NAME = "secure"
const MASTER_KEY_ID = "masterKey"
/** 记录 master key 的来源："seed" | "legacy-random" */
const MASTER_KEY_SOURCE_ID = "masterKeySource"

/**
 * PBKDF2 迭代次数（OWASP 推荐 ≥ 310k）。
 * 浏览器与 Worker 必须使用相同值，否则派生出的 master key 不一致、密文无法互通。
 */
export const PBKDF2_ITERATIONS = 310_000
/** 派生盐前缀（保证不同应用/用途互不干扰） */
export const SEED_SALT_PREFIX = "cloudclipboard:v1:"

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
      // 确保 web/storage 包的 store 也存在（两个模块共用同一个 DB）
      if (!db.objectStoreNames.contains(SECURE_STORE_NAME)) {
        db.createObjectStore(SECURE_STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function getMasterKeyFromIndexedDB(): Promise<string | null> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly")
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(MASTER_KEY_ID)
      request.onsuccess = () => resolve((request.result as string) ?? null)
      request.onerror = () => reject(request.error)
    })
  } catch {
    return null
  }
}

export async function storeMasterKeyInIndexedDB(key: string): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    const store = tx.objectStore(STORE_NAME)
    store.put(key, MASTER_KEY_ID)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

/**
 * 请求浏览器将本站点存储标记为持久化，防止 iOS/Safari 在存储压力下
 * 清除 IndexedDB（会导致 master key 丢失、所有历史密文无法解密）。
 * 应在应用启动时调用一次。
 */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist) {
      const alreadyPersisted = await navigator.storage.persisted()
      if (!alreadyPersisted) {
        await navigator.storage.persist()
      }
    }
  } catch {
    // 某些环境不支持，忽略即可
  }
}

/** 记录 master key 来源（seed 派生 / 旧版随机） */
async function storeMasterKeySource(source: "seed" | "legacy-random"): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite")
      const store = tx.objectStore(STORE_NAME)
      store.put(source, MASTER_KEY_SOURCE_ID)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // 静默降级
  }
}

/** 读取 master key 来源标识 */
export async function getMasterKeySourceFromIndexedDB(): Promise<"seed" | "legacy-random" | null> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly")
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(MASTER_KEY_SOURCE_ID)
      request.onsuccess = () => {
        const v = request.result as string | undefined
        resolve(v === "seed" || v === "legacy-random" ? v : null)
      }
      request.onerror = () => reject(request.error)
    })
  } catch {
    return null
  }
}

// ──────────────────────────────
// 种子短语派生（路线 B）
// ──────────────────────────────

/**
 * 从「种子短语 + 用户身份」派生 master key。
 * 同一短语 + 同一 userId 在任何设备上得到同一把 key。
 */
export async function deriveMasterKeyFromSeed(
  seedPhrase: string,
  userId: string
): Promise<CryptoKey> {
  const normalized = seedPhrase.trim()
  if (!normalized) {
    throw new Error("种子短语不能为空")
  }
  const salt = new TextEncoder().encode(SEED_SALT_PREFIX + userId)
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(normalized),
    "PBKDF2",
    false,
    ["deriveKey"]
  )
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  )
}

/**
 * 用种子短语设置 master key 并持久化。
 * 清除旧 key（如果有），旧 key 加密的数据将无法再解密（需重新输入种子恢复）。
 */
export async function setupMasterKeyFromSeed(
  seedPhrase: string,
  userId: string
): Promise<CryptoKey> {
  const key = await deriveMasterKeyFromSeed(seedPhrase, userId)
  const exported = await exportKey(key)
  await storeMasterKeyInIndexedDB(exported)
  await storeMasterKeySource("seed")
  return key
}

/**
 * 获取 master key。
 * - 若 IndexedDB 已有 master key，直接返回
 * - 若没有，返回 null（调用方应提示用户输入种子短语）
 */
export async function getMasterKey(): Promise<CryptoKey | null> {
  const stored = await getMasterKeyFromIndexedDB()
  if (stored) {
    try {
      return await importKey(stored)
    } catch {
      return null
    }
  }
  return null
}

/** 清除本机 master key（用户主动重置场景） */
export async function clearMasterKeyFromIndexedDB(): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite")
      const store = tx.objectStore(STORE_NAME)
      store.delete(MASTER_KEY_ID)
      store.delete(MASTER_KEY_SOURCE_ID)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // 静默降级
  }
}

// ──────────────────────────────
// 密钥派生工具（种子短语）
// ──────────────────────────────

/** SHA-256 摘要（用于 OTP 哈希等） */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}
