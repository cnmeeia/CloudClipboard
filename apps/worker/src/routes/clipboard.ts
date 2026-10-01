/**
 * Clipboard 路由：list / create / get / delete
 *
 * 创建时：
 * 1. 密文入库（D1）
 * 2. 通过 Bark 向其他设备发送通知（不携带明文）
 */

import type { Env } from "../env"
import { createClipboardSchema, DEFAULT_TTL_MS } from "@cloudclipboard/shared"
import { encryptClipboardContent, deriveMasterKeyFromSeed } from "@cloudclipboard/crypto"
import { generateUUID, requireAuth, type AccessIdentity } from "../auth"
import { deleteClipboardItem, findRecentDuplicateByCiphertext, getBarkUrlsByUserExcludingDevice, getClipboardItem, getClipboardR2Key, insertAuditLog, insertClipboardItem, listClipboardItems, touchDeviceByUser, getUserNotificationPrefs } from "../db"
import { fanOutBark } from "../push/bark"
import { json, jsonError, notFound } from "./response"

/**
 * 创建剪贴板记录公共逻辑：upsert 设备 → 插入条目 → 审计 → Bark 通知。
 * 供 handleClipboardCreate 与 handleClipboardPlainCreate 复用，消除重复。
 */
interface CreateClipboardParams {
  deviceId: string
  deviceName: string
  type: string
  encryptedData: string
  iv: string | null
  salt: string | null
  wrappedKey: string | null
  r2Key: string | null
  size: number | null
  mimeType: string | null
  filename: string | null
  /** 有效期（毫秒）；null 表示永久（expires_at = NULL，永不过期） */
  ttlMs: number | null
  plain?: number
  /** 设备注册信息覆盖（平台/浏览器/类型），默认自动从 UA 检测 */
  platform?: string
  browser?: string
  deviceType?: string
  auditAction?: string
  /** 审计详情中的附加字段（如 e2ee 标记），id 会自动加入 */
  auditExtra?: Record<string, unknown>
}

/**
 * 重复上传（重放）判定窗口：同一设备在这段时间内提交逐字节相同的密文，
 * 视为同一次上传被重复提交，直接复用已有记录（不插入第二条）。
 */
const DUPLICATE_REPLAY_WINDOW_MS = 60_000

async function createClipboardRecord(
  env: Env,
  auth: AccessIdentity,
  params: CreateClipboardParams
): Promise<Record<string, unknown> | null> {
  const id = generateUUID()
  const now = Date.now()

  // 幂等保护（Issue #86「双重粘贴直接两次」）：
  // 同一设备在极短窗口内重复提交**同一批密文**，说明是同一次上传被重放
  // （网络重试 / 连按两次同步 / ⌘↵ 连按两下），直接返回已有记录，不再插入第二条。
  // 用密文+IV 做指纹：AES-GCM 每次加密结果都不同，所以「用户有意重复同步同一内容」
  // 不会被拦（那种情况密文不同），只有逐字节相同的重放才会命中。
  const dupId = await findRecentDuplicateByCiphertext(env, {
    userId: auth.userId,
    deviceId: params.deviceId,
    encryptedData: params.encryptedData,
    iv: params.iv,
    since: now - DUPLICATE_REPLAY_WINDOW_MS,
  })
  if (dupId) {
    const existing = await getClipboardItem(env, dupId, auth.userId, now)
    if (existing) {
      // 返回已存在的记录（与首次创建响应同构），客户端可安全地原地替换本地卡片
      return {
        item: {
          id: existing.id,
          type: existing.type,
          device_id: existing.device_id,
          device_name: existing.device_name || params.deviceName,
          encrypted_data: existing.encrypted_data,
          iv: existing.iv,
          salt: existing.salt,
          wrapped_key: existing.wrapped_key,
          r2_key: existing.r2_key,
          size: existing.size,
          mime_type: existing.mime_type,
          filename: existing.filename,
          plain: existing.plain ? 1 : 0,
          created_at: existing.created_at,
          expires_at: existing.expires_at,
        },
        deduplicated: true,
        push: { sent: 0, total: 0 },
      }
    }
  }

  // ttlMs 为 null → 永久保存（expires_at = NULL），不被删除
  const expiresAt = params.ttlMs === null ? null : now + params.ttlMs

  // 上传前确保设备存在并更新 last_seen（设备应在 registerDevice 时已创建）。
  // 使用 touchDeviceByUser 只更新 last_seen，不覆盖已有设备的 platform/browser
  // 等注册元数据——否则 iPadOS 的 UA 检测会把正确的 "ipad" 覆盖为 "mac"。
  await touchDeviceByUser(env, {
    id: params.deviceId,
    userId: auth.userId,
    name: params.deviceName,
    now,
    platform: params.platform,
    browser: params.browser,
    deviceType: params.deviceType,
  })

  await insertClipboardItem(env, {
    id,
    userId: auth.userId,
    deviceId: params.deviceId,
    type: params.type,
    encryptedData: params.encryptedData,
    iv: params.iv,
    salt: params.salt,
    wrappedKey: params.wrappedKey,
    r2Key: params.r2Key,
    size: params.size,
    mimeType: params.mimeType,
    filename: params.filename,
    now,
    expiresAt,
    plain: params.plain ?? 0,
  })

  // 记录审计（失败不影响剪贴板创建）
  try {
    await insertAuditLog(env, {
      id: generateUUID(),
      userId: auth.userId,
      deviceId: params.deviceId,
      action: params.auditAction ?? "clipboard.create",
      detail: JSON.stringify({ type: params.type, itemId: id, ...(params.auditExtra ?? {}) }),
      now,
    })
  } catch (e) {
    console.error("[CloudClipboard] insertAuditLog failed (non-fatal):", e)
  }

  let pushSent = 0
  let pushTotal = 0

  // 通过 Bark 向其他设备发送通知（不携带明文，仅提示）
  // 先检查用户通知偏好：用户关闭"剪贴板通知"时跳过推送
  try {
    const prefs = await getUserNotificationPrefs(env, auth.userId)
    if (prefs.new_clipboard) {
      const barkUrls = await getBarkUrlsByUserExcludingDevice(env, auth.userId, params.deviceId)
      if (barkUrls.length > 0) {
        await fanOutBark(barkUrls, params.deviceName)
        pushSent = barkUrls.length
        pushTotal = barkUrls.length
      }
    }
  } catch (e) {
    console.error("Bark 通知发送失败:", e)
  }

  return {
    item: {
      id,
      type: params.type,
      device_id: params.deviceId,
      device_name: params.deviceName,
      encrypted_data: params.encryptedData,
      iv: params.iv,
      salt: params.salt,
      wrapped_key: params.wrappedKey,
      r2_key: params.r2Key,
      size: params.size,
      mime_type: params.mimeType,
      filename: params.filename,
      plain: params.plain ?? 0,
      created_at: now,
      expires_at: expiresAt,
    },
    push: { sent: pushSent, total: pushTotal },
  }
}


// GET /api/clipboard
export async function handleClipboardList(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env)

  const url = new URL(request.url)
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "30", 10) || 30, 1), 200)
  const now = Date.now()

  const rows = await listClipboardItems(env, auth.userId, limit, now)

  const items = rows.map((r) => ({
    id: r.id,
    device_id: r.device_id,
    device_name: r.device_name || "Unknown",
    type: r.type,
    encrypted_data: r.encrypted_data,
    iv: r.iv,
    salt: r.salt,
    wrapped_key: r.wrapped_key,
    r2_key: r.r2_key,
    size: r.size,
    mime_type: r.mime_type,
    filename: r.filename,
    plain: r.plain ? 1 : 0,
    created_at: r.created_at,
    expires_at: r.expires_at,
  }))

  return json({ success: true, items, count: items.length })
}

// POST /api/clipboard
export async function handleClipboardCreate(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env)

  const deviceId = request.headers.get("x-device-id") || "unknown"
  const deviceName = request.headers.get("x-device-name") || "Unknown"

  const body = await request.json().catch(() => null)
  const parsed = createClipboardSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError("VALIDATION_ERROR", "缺少加密数据或格式错误: " + parsed.error.issues.map(i => i.message).join("; "))
  }

  // 前端 PWA 默认"永久"（不传 expires_in / 传 null）→ 必须真正永不过期，
  // 不能被 DEFAULT_TTL_MS 静默覆盖成 7 天后删除（否则界面显示永久却丢失）。
  // 只有明确选择过期时长（expires_in 有值）才设置 TTL；null 落库为 expires_at = NULL。
  const ttlMs = parsed.data.expires_in ?? null
  const result = await createClipboardRecord(env, auth, {
    deviceId,
    deviceName: deviceName === "Unknown" ? "API" : deviceName,
    type: parsed.data.type,
    encryptedData: parsed.data.encrypted_data,
    iv: parsed.data.iv,
    salt: parsed.data.salt ?? null,
    wrappedKey: parsed.data.wrapped_key ?? null,
    r2Key: parsed.data.r2_key ?? null,
    size: parsed.data.size ?? null,
    mimeType: parsed.data.mime_type ?? null,
    filename: parsed.data.filename ?? null,
    ttlMs,
    plain: 0,
    platform: "pwa",
    deviceType: deviceId === "unknown" ? "cli" : "pwa",
  })
  if (!result) return jsonError("INSERT_ERROR", "创建剪贴板记录失败")

  return json({ success: true, ...result }, 201)
}

// GET /api/clipboard/:id
export async function handleClipboardGet(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireAuth(request, env)

  const row = await getClipboardItem(env, id, auth.userId, Date.now())
  if (!row) return notFound("记录不存在或已过期")

  // R2 对象读取（文件/图片）
  // 使用 Uint8Array→base64 的分块转换，避免大文件一次性全部读入内存时创建超长字符串
  let base64Content: string | null = null
  if (row.r2_key) {
    const obj = await env.BUCKET.get(row.r2_key)
    if (obj) {
      const bytes = new Uint8Array(await obj.arrayBuffer())
      // 分块转换：每块 0x8000 字节，避免单次 String.fromCharCode 参数过长
      let binary = ""
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      }
      base64Content = btoa(binary)
      // 释放大字符串引用，帮助 GC
      binary = ""
    }
  }

  return json({
    success: true,
    item: {
      id: row.id,
      device_id: row.device_id,
      device_name: row.device_name || "Unknown",
      type: row.type,
      encrypted_data: row.encrypted_data,
      iv: row.iv,
      salt: row.salt,
      wrapped_key: row.wrapped_key,
      r2_key: row.r2_key,
      size: row.size,
      mime_type: row.mime_type,
      filename: row.filename,
      plain: row.plain ? 1 : 0,
      created_at: row.created_at,
      expires_at: row.expires_at,
      base64_content: base64Content,
    },
  })
}

// DELETE /api/clipboard/:id
export async function handleClipboardDelete(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireAuth(request, env)

  const row = await getClipboardR2Key(env, id, auth.userId)
  if (!row) return notFound("记录不存在")

  if (row.r2_key) {
    await env.BUCKET.delete(row.r2_key)
  }
  await deleteClipboardItem(env, id, auth.userId)

  return json({ success: true })
}

/**
 * POST /api/clipboard/plain
 *
 * curl 友好上传接口（配合 API Token 使用）。
 *
 * body 支持两种模式：
 *
 * 1) 明文模式：body = { content, confirmPlaintext: true, type?, expires_in? }
 *    content 为明文。⚠️ 服务器可见明文，存储时 plain=1。
 *    必须显式传 confirmPlaintext=true 才会启用明文存储（防止误用导致明文落库），
 *    且明文记录 TTL 强制 ≤ 5 分钟。
 *
 * 2) E2EE 模式：body = { content, passphrase, type?, expires_in? }
 *    服务器用 PBKDF2 从 passphrase 派生 master key，对 content 做 AES-256-GCM 加密后存储。
 *    即使数据库泄露也无法还原明文。前端输入相同 passphrase（种子短语）即可解密。
 *
 * 推荐使用 E2EE 模式。
 */
export async function handleClipboardPlainCreate(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env)

  // 设备标识：默认用 token 名（无 token 时用 unknown）
  const deviceId = request.headers.get("x-device-id") || `token_${auth.name || "unknown"}`
  const deviceName = request.headers.get("x-device-name") || "API"

  const body = (await request.json().catch(() => null)) as {
    content?: string
    text?: string
    passphrase?: string
    type?: string
    expires_in?: number | string
    confirmPlaintext?: boolean
  } | null
  const content =
    typeof body?.content === "string" && body.content.trim().length > 0
      ? body.content
      : typeof body?.text === "string" && body.text.trim().length > 0
        ? body.text
        : null

  if (content === null) {
    return jsonError("VALIDATION_ERROR", "缺少 content（明文内容）字段")
  }

  const type = typeof body?.type === "string" && ["text", "url", "code"].includes(body.type) ? body.type : "text"
  const ttlMs = body?.expires_in ? Number(body.expires_in) : (env.DEFAULT_TTL_MS ? Number(env.DEFAULT_TTL_MS) : DEFAULT_TTL_MS)
  const expiresIn = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_TTL_MS

  // 检测 E2EE 模式：是否提供了 passphrase
  const passphrase = typeof body?.passphrase === "string" && body.passphrase.trim().length >= 8
    ? body.passphrase.trim()
    : null

  // 明文模式必须显式确认（confirmPlaintext=true），防止误用导致明文落库
  const confirmPlaintext = body?.confirmPlaintext === true
  if (!passphrase && !confirmPlaintext) {
    return jsonError("CONFIRMATION_REQUIRED", "明文上传需显式设置 confirmPlaintext: true（或用 passphrase 启用 E2EE）")
  }

  let encryptedData = content
  let iv: string | null = null
  let salt: string | null = null
  let wrappedKey: string | null = null
  let plainFlag = 1
  let isE2EE = false

  if (passphrase) {
    try {
      // 用 passphrase + userId 派生 master key（与前端种子短语同一派生算法）
      const masterKey = await deriveMasterKeyFromSeed(passphrase, auth.userId)
      const result = await encryptClipboardContent(content, masterKey)
      encryptedData = result.encrypted
      iv = result.iv
      salt = result.salt
      wrappedKey = result.wrappedKey
      plainFlag = 0
      isE2EE = true
    } catch (e) {
      console.error("[CloudClipboard] E2EE 加密失败:", e)
      return jsonError("E2EE_ERROR", "E2EE 加密失败，请重试")
    }
  } else {
    // 明文模式：强制 TTL ≤ 5 分钟（300000ms），防止明文长期驻留
    const PLAINTEXT_MAX_TTL_MS = 300000
    if (expiresIn > PLAINTEXT_MAX_TTL_MS) {
      return jsonError("TTL_TOO_LONG", `明文记录 TTL 不得超过 ${PLAINTEXT_MAX_TTL_MS / 1000} 秒`)
    }
  }

  const result = await createClipboardRecord(env, auth, {
    deviceId,
    deviceName,
    type,
    encryptedData,
    iv,
    salt,
    wrappedKey,
    r2Key: null,
    size: content.length,
    mimeType: null,
    filename: null,
    ttlMs: expiresIn,
    plain: plainFlag,
    platform: "api",
    deviceType: "api",
    auditAction: isE2EE ? "clipboard.create_e2ee" : "clipboard.create_plain",
    auditExtra: { e2ee: isE2EE },
  })
  if (!result) return jsonError("INSERT_ERROR", "创建剪贴板记录失败")

  return json(
    {
      success: true,
      ...result,
      ...(isE2EE
        ? { note: "内容已通过 E2EE 加密存储（AES-256-GCM + PBKDF2）。" }
        : { note: "内容以明文存储（未做 E2EE）。建议传入 passphrase 字段启用端到端加密。" }),
    },
    201
  )
}
