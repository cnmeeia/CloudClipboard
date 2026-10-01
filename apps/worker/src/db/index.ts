/**
 * D1 数据库访问层（参数化 SQL，防注入）
 */

import type { Env } from "../env"
import type { DeviceInfoRow } from "@cloudclipboard/types"

// ──────────────────────────────
// 设备
// ──────────────────────────────

export async function getDeviceById(env: Env, deviceId: string, userId?: string): Promise<DeviceInfoRow | null> {
  if (userId) {
    // 带归属校验：防止跨用户探测设备是否存在（IDOR）
    return env.DB.prepare(
      `SELECT id, user_id, name, platform, browser, device_type, last_seen, created_at, updated_at, revoked_at, bark_url
       FROM devices WHERE id = ? AND user_id = ?`
    ).bind(deviceId, userId).first<DeviceInfoRow>()
  }
  return env.DB.prepare(
    `SELECT id, user_id, name, platform, browser, device_type, last_seen, created_at, updated_at, revoked_at, bark_url
     FROM devices WHERE id = ?`
  ).bind(deviceId).first<DeviceInfoRow>()
}

export async function listDevicesByUser(env: Env, userId: string): Promise<DeviceInfoRow[]> {
  const res = await env.DB.prepare(
    `SELECT id, user_id, name, platform, browser, device_type, last_seen, created_at, updated_at, revoked_at, bark_url
     FROM devices WHERE user_id = ? ORDER BY last_seen DESC`
  ).bind(userId).all<DeviceInfoRow>()
  return res.results ?? []
}

/**
 * 注册/更新当前设备（upsert，幂等）。
 * deviceId 由客户端持久化，userId 来自 CF Access 身份（稳定），
 * 因此应用升级后设备与数据归属保持不变。
 *
 * 注意：此函数会更新 platform/browser/name（用于 registerDevice 路径）。
 * 若只想更新 last_seen 而不覆盖已有设备元数据（如 clipboard 创建时），
 * 请使用 touchDeviceLastSeenByUser 代替。
 */
export async function upsertDevice(
  env: Env,
  params: {
    id: string
    userId: string
    name: string
    platform: string
    browser: string
    deviceType: string
    now: number
  }
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (id, display_name, created_at, updated_at, last_login_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET display_name = COALESCE(NULLIF(display_name, ''), excluded.display_name),
       updated_at = excluded.updated_at, last_login_at = excluded.last_login_at`
  ).bind(params.userId, params.name, params.now, params.now, params.now).run()

  await env.DB.prepare(
    `INSERT INTO devices (id, user_id, name, platform, browser, device_type, last_seen, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       platform = excluded.platform,
       browser = excluded.browser,
       device_type = excluded.device_type,
       last_seen = excluded.last_seen,
       updated_at = excluded.updated_at`
  ).bind(
    params.id,
    params.userId,
    params.name,
    params.platform,
    params.browser,
    params.deviceType,
    params.now,
    params.now,
    params.now
  ).run()
}

/**
 * 更新设备 last_seen（保留已注册的 platform/browser/name 元数据）。
 * 用于 clipboard 创建等高频路径：确保设备在线状态更新，但不会用
 * 服务端 UA 检测覆盖前端注册的正确平台信息（iPadOS 的 UA 不可靠）。
 *
 * 新设备首次出现时按给定元数据创建（name/platform/browser/deviceType）。
 */
export async function touchDeviceByUser(
  env: Env,
  params: {
    id: string
    userId: string
    name: string
    now: number
    platform?: string
    browser?: string
    deviceType?: string
  }
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (id, created_at, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`
  ).bind(params.userId, params.now, params.now).run()

  // 若设备已存在，仅更新 last_seen（保留已注册的平台等元数据）。
  // 若不存在（新设备/API Token 首次使用），按给定参数创建。
  // INSERT ... ON CONFLICT 无法用 WHERE 区分"已存在时跳过字段"，
  // 因此先尝试仅更新 last_seen，若无受影响行则走 INSERT。
  const platform = params.platform ?? "web"
  const browser = params.browser ?? ""
  const deviceType = params.deviceType ?? "pwa"

  await env.DB.prepare(
    `INSERT INTO devices (id, user_id, name, platform, browser, device_type, last_seen, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       last_seen = excluded.last_seen,
       updated_at = excluded.updated_at`
  ).bind(
    params.id,
    params.userId,
    params.name,
    platform,
    browser,
    deviceType,
    params.now,
    params.now,
    params.now
  ).run()
}

/** 删除某用户的设备及其产生的剪贴板记录（含 R2 key 由调用方清理） */
export async function deleteDeviceByUser(
  env: Env,
  deviceId: string,
  userId: string
): Promise<string[]> {
  // 先取该设备产生的 R2 对象 key
  const items = await env.DB.prepare(
    `SELECT r2_key FROM clipboard_items WHERE device_id = ? AND user_id = ? AND r2_key IS NOT NULL`
  ).bind(deviceId, userId).all<{ r2_key: string }>()
  const r2Keys = (items.results ?? []).map((r) => r.r2_key).filter(Boolean)

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM clipboard_items WHERE device_id = ? AND user_id = ?`).bind(deviceId, userId),
    env.DB.prepare(`DELETE FROM audit_logs WHERE device_id = ?`).bind(deviceId),
    env.DB.prepare(`DELETE FROM devices WHERE id = ? AND user_id = ?`).bind(deviceId, userId),
  ])

  return r2Keys
}

export async function updateDeviceLastSeen(env: Env, deviceId: string, now: number): Promise<void> {
  await env.DB.prepare(
    `UPDATE devices SET last_seen = ?, updated_at = ? WHERE id = ?`
  ).bind(now, now, deviceId).run()
}

export async function updateDeviceName(env: Env, deviceId: string, userId: string, name: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE devices SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?`
  ).bind(name, Date.now(), deviceId, userId).run()
}

export async function updateDeviceBarkUrl(env: Env, deviceId: string, userId: string, barkUrl: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE devices SET bark_url = ?, updated_at = ? WHERE id = ? AND user_id = ?`
  ).bind(barkUrl || null, Date.now(), deviceId, userId).run()
}

// ──────────────────────────────
// 用户偏好（跨设备同步，存 users 表）
// ──────────────────────────────

/**
 * 读取用户主题偏好；用户不存在 / 从未显式设置时返回 null（由调用方回退到 "system"）。
 *
 * 用 theme_set 标记区分「用户显式设置了 system」与「从未设置」：
 * 旧实现只看 theme 字段，而部分更新（如只更新通知偏好）会把 theme 重置成
 * 列默认值 "system"，导致用户设置的主题被静默清掉。
 * 兼容：theme_set 列缺失（迁移未执行）时不做 WHERE 过滤，回退旧行为。
 */
export async function getUserTheme(env: Env, userId: string): Promise<string | null> {
  const read = async (whereSetFlag: boolean): Promise<string | null> => {
    const row = await env.DB.prepare(
      whereSetFlag
        ? `SELECT theme FROM users WHERE id = ? AND theme_set = 1`
        : `SELECT theme FROM users WHERE id = ?`
    )
      .bind(userId)
      .first<{ theme: string | null }>()
    return row?.theme ?? null
  }
  try {
    return await read(true)
  } catch (e) {
    console.error("[db] getUserTheme 使用 theme_set 查询失败，回退旧行为：", e)
    return read(false)
  }
}

/**
 * 写入/更新用户主题偏好（upsert，用户行不存在时创建）。
 *
 * - 用户行已存在 → 只更新 theme + theme_set，不动其它列（通知偏好等）
 * - 用户行不存在 → INSERT，theme_set = 1（显式设置）
 * 首次 INSERT 未提供通知偏好列时，由列默认值兜底，语义正确。
 */
export async function upsertUserTheme(env: Env, userId: string, theme: string): Promise<void> {
  const now = Date.now()
  await env.DB.prepare(
    `INSERT INTO users (id, theme, theme_set, created_at, updated_at)
     VALUES (?, ?, 1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET theme = excluded.theme, theme_set = 1, updated_at = excluded.updated_at`
  )
    .bind(userId, theme, now, now)
    .run()
}

// ──────────────────────────────
// 用户通知偏好
// ──────────────────────────────

/** 读取用户通知偏好（四个布尔开关） */
export async function getUserNotificationPrefs(
  env: Env,
  userId: string
): Promise<{ new_clipboard: boolean; device_online: boolean; device_added: boolean; security_alert: boolean }> {
  const row = await env.DB.prepare(
    `SELECT notif_new_clipboard, notif_device_online, notif_device_added, notif_security_alert
     FROM users WHERE id = ?`
  ).bind(userId).first<{ notif_new_clipboard: number | null; notif_device_online: number | null; notif_device_added: number | null; notif_security_alert: number | null }>()

  return {
    new_clipboard: row ? row.notif_new_clipboard !== 0 : true,
    device_online: row ? row.notif_device_online === 1 : false,
    device_added: row ? row.notif_device_added !== 0 : true,
    security_alert: row ? row.notif_security_alert !== 0 : true,
  }
}

/** 更新用户通知偏好（部分更新，传 null 的字段不更新） */
export async function upsertUserNotificationPrefs(
  env: Env,
  userId: string,
  prefs: {
    new_clipboard?: boolean
    device_online?: boolean
    device_added?: boolean
    security_alert?: boolean
  }
): Promise<void> {
  const now = Date.now()

  // 先确保用户行存在。注意：这里不能写多余列——SQLite 的
  // ON CONFLICT DO UPDATE 会用 excluded.<col> 覆盖传入列，
  // 因此 INSERT 只列出 id/时间戳，避免连带重置其它偏好（如 theme）。
  await env.DB.prepare(
    `INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`
  ).bind(userId, now, now).run()

  const sets: string[] = []
  const params: unknown[] = []

  if (prefs.new_clipboard !== undefined) {
    sets.push("notif_new_clipboard = ?")
    params.push(prefs.new_clipboard ? 1 : 0)
  }
  if (prefs.device_online !== undefined) {
    sets.push("notif_device_online = ?")
    params.push(prefs.device_online ? 1 : 0)
  }
  if (prefs.device_added !== undefined) {
    sets.push("notif_device_added = ?")
    params.push(prefs.device_added ? 1 : 0)
  }
  if (prefs.security_alert !== undefined) {
    sets.push("notif_security_alert = ?")
    params.push(prefs.security_alert ? 1 : 0)
  }
  if (sets.length > 0) {
    sets.push("updated_at = ?")
    params.push(now)
    await env.DB.prepare(
      `UPDATE users SET ${sets.join(", ")} WHERE id = ?`
    ).bind(...params, userId).run()
  }
}

export async function getBarkUrlsByUserExcludingDevice(
  env: Env,
  userId: string,
  excludeDeviceId: string
): Promise<string[]> {
  const res = await env.DB.prepare(
    `SELECT bark_url FROM devices WHERE user_id = ? AND id != ? AND revoked_at IS NULL AND bark_url IS NOT NULL AND bark_url != ''`
  ).bind(userId, excludeDeviceId).all<{ bark_url: string }>()
  return (res.results ?? []).map((r) => r.bark_url)
}

// ──────────────────────────────
// API Token（curl / CLI 调用认证）
// ──────────────────────────────

export interface ApiTokenRow {
  id: string
  user_id: string
  name: string
  token_hash: string
  created_at: number
  last_used_at: number | null
  expires_at: number | null
  revoked_at: number | null
}

/** 按哈希查找有效（未吊销、未过期）的 API Token */
export async function findApiTokenByHash(
  env: Env,
  tokenHash: string
): Promise<ApiTokenRow | null> {
  return env.DB.prepare(
    `SELECT id, user_id, name, token_hash, created_at, last_used_at, expires_at, revoked_at
     FROM api_tokens
     WHERE token_hash = ? AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > ?)`
  ).bind(tokenHash, Date.now()).first<ApiTokenRow>()
}

/** 列出某用户的 API Token（不含哈希，仅元信息，过滤已吊销） */
export async function listApiTokensByUser(env: Env, userId: string): Promise<ApiTokenRow[]> {
  const res = await env.DB.prepare(
    `SELECT id, user_id, name, token_hash, created_at, last_used_at, expires_at, revoked_at
     FROM api_tokens WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC`
  ).bind(userId).all<ApiTokenRow>()
  return res.results ?? []
}

/** 新增 API Token（仅存哈希） */
export async function insertApiToken(
  env: Env,
  params: {
    id: string
    userId: string
    tokenHash: string
    name: string
    now: number
    expiresAt: number | null
  }
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO api_tokens (id, user_id, token_hash, name, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    params.id,
    params.userId,
    params.tokenHash,
    params.name,
    params.now,
    params.expiresAt
  ).run()
}

/** 更新 token 最近使用时间 */
export async function touchApiToken(env: Env, id: string): Promise<void> {
  await env.DB.prepare(`UPDATE api_tokens SET last_used_at = ? WHERE id = ?`)
    .bind(Date.now(), id)
    .run()
}

/** 吊销 API Token（软删除） */
export async function revokeApiToken(env: Env, id: string, userId: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL`
  ).bind(Date.now(), id, userId).run()
}

// ──────────────────────────────
// Clipboard
// ──────────────────────────────

export interface ClipboardRow {
  id: string
  user_id: string
  device_id: string
  type: string
  encrypted_data: string | null
  iv: string | null
  salt: string | null
  wrapped_key: string | null
  r2_key: string | null
  size: number | null
  mime_type: string | null
  filename: string | null
  created_at: number
  expires_at: number | null
  /** 是否明文（API Token / curl 上传，未做客户端 E2EE） */
  plain?: number
  device_name?: string
}

export async function insertClipboardItem(
  env: Env,
  params: {
    id: string
    userId: string
    deviceId: string
    type: string
    encryptedData: string
    iv: string | null
    salt: string | null
    wrappedKey: string | null
    r2Key: string | null
    size: number | null
    mimeType: string | null
    filename: string | null
    now: number
    expiresAt: number | null
    plain?: number
  }
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO clipboard_items (id, user_id, device_id, type, encrypted_data, iv, salt, wrapped_key, r2_key, size, mime_type, filename, created_at, expires_at, plain)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    params.id,
    params.userId,
    params.deviceId,
    params.type,
    params.encryptedData,
    params.iv,
    params.salt,
    params.wrappedKey,
    params.r2Key,
    params.size,
    params.mimeType,
    params.filename,
    params.now,
    params.expiresAt,
    params.plain ?? 0
  ).run()
}

export async function listClipboardItems(
  env: Env,
  userId: string,
  limit: number,
  now: number
): Promise<ClipboardRow[]> {
  const res = await env.DB.prepare(
    `SELECT ci.id, ci.user_id, ci.device_id, ci.type, ci.encrypted_data, ci.iv, ci.salt, ci.wrapped_key, ci.r2_key, ci.size, ci.mime_type, ci.filename, ci.created_at, ci.expires_at, ci.plain, d.name as device_name
     FROM clipboard_items ci
     JOIN devices d ON d.id = ci.device_id
     WHERE ci.user_id = ? AND (ci.expires_at IS NULL OR ci.expires_at > ?)
     ORDER BY ci.created_at DESC LIMIT ?`
  ).bind(userId, now, limit).all<ClipboardRow>()
  return res.results ?? []
}

/**
 * 查同一台设备在近 windowMs 内是否已经上传过「同一批密文」。
 *
 * 背景（Issue #86「双重粘贴直接两次」）：POST /api/clipboard 不是幂等的，
 * 每次请求都会 INSERT 一条新记录。当客户端因为网络抖动重试、
 * 用户连按两次同步（或 ⌘↵ 连按两下）时，库里会真的多出一条一模一样的记录，
 * 列表里就出现两张内容完全相同的卡片——用户看到的就是「粘贴双重了」。
 *
 * 这里用 AES-256-GCM 密文 + IV 做指纹：同一明文同一 master key 加密结果必然不同，
 * 所以只有「同一次上传被重复提交」（密文逐字节相同）才会命中，
 * 不会误伤用户有意重复同步的相同内容。
 *
 * 返回命中的已有记录 id（未命中返回 null）。
 */
export async function findRecentDuplicateByCiphertext(
  env: Env,
  params: { userId: string; deviceId: string; encryptedData: string; iv: string | null; since: number }
): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT id FROM clipboard_items
     WHERE user_id = ? AND device_id = ? AND encrypted_data = ?
       AND (iv IS ? OR iv = ?)
       AND created_at >= ?
     ORDER BY created_at DESC LIMIT 1`
  )
    .bind(params.userId, params.deviceId, params.encryptedData, params.iv, params.iv, params.since)
    .first<{ id: string }>()
  return row?.id ?? null
}

export async function getClipboardItem(
  env: Env,
  id: string,
  userId: string,
  now: number
): Promise<ClipboardRow | null> {
  return env.DB.prepare(
    `SELECT ci.id, ci.user_id, ci.device_id, ci.type, ci.encrypted_data, ci.iv, ci.salt, ci.wrapped_key, ci.r2_key, ci.size, ci.mime_type, ci.filename, ci.created_at, ci.expires_at, ci.plain, d.name as device_name
     FROM clipboard_items ci
     JOIN devices d ON d.id = ci.device_id
     WHERE ci.id = ? AND ci.user_id = ? AND (ci.expires_at IS NULL OR ci.expires_at > ?)`
  ).bind(id, userId, now).first<ClipboardRow>()
}

export async function getClipboardR2Key(
  env: Env,
  id: string,
  userId: string
): Promise<{ r2_key: string | null } | null> {
  return env.DB.prepare(
    `SELECT r2_key FROM clipboard_items WHERE id = ? AND user_id = ?`
  ).bind(id, userId).first<{ r2_key: string | null }>()
}

export async function deleteClipboardItem(env: Env, id: string, userId: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM clipboard_items WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .run()
}

export async function insertAuditLog(
  env: Env,
  params: { id: string; userId: string; deviceId: string; action: string; detail: string; now: number }
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, device_id, action, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(params.id, params.userId, params.deviceId, params.action, params.detail, params.now).run()
}

// ──────────────────────────────
// Rate Limit（D1 持久化计数）
// ──────────────────────────────

export interface RateLimitRow {
  count: number
}

export async function incrementRateLimit(
  env: Env,
  key: string,
  windowStart: number
): Promise<number> {
  // 先清理旧窗口
  await env.DB.prepare(`DELETE FROM rate_limits WHERE window_start < ?`).bind(windowStart).run()

  await env.DB.prepare(
    `INSERT INTO rate_limits (key, window_start, count, updated_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1, updated_at = ?`
  ).bind(key, windowStart, Date.now(), Date.now()).run()

  const row = await env.DB.prepare(
    `SELECT count FROM rate_limits WHERE key = ? AND window_start = ?`
  ).bind(key, windowStart).first<RateLimitRow>()
  return row?.count ?? 1
}

// ──────────────────────────────
// 用户（cf_subject 绑定与自动创建）
// ──────────────────────────────

/**
 * 认证通过后自动创建/更新用户记录（upsert by id）。
 * 
 * 安全策略：
 * - users.id 是稳定 userId（由 email SHA-256 派生，向后兼容）
 * - users.cf_subject 是 Cloudflare Access JWT 的 sub（唯一标识）
 * - email 可在 JWT payload 中获取，用户首次请求时自动建行
 */
export async function upsertUserByAuth(
  env: Env,
  params: {
    userId: string
    cfSubject: string
    email: string
    now: number
  }
): Promise<void> {
  // 只更新身份相关列。不能把 theme / notif_* 等偏好列写进 INSERT：
  // SQLite 冲突时会用 excluded 值覆盖，导致每次登录都把偏好重置为列默认值。
  await env.DB.prepare(
    `INSERT INTO users (id, cf_subject, email, created_at, updated_at, last_login_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       cf_subject = COALESCE(NULLIF(excluded.cf_subject, ''), users.cf_subject),
       email = COALESCE(NULLIF(excluded.email, ''), users.email),
       updated_at = excluded.updated_at,
       last_login_at = excluded.last_login_at`
  ).bind(
    params.userId,
    params.cfSubject,
    params.email,
    params.now,
    params.now,
    params.now
  ).run()
}
