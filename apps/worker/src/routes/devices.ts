/**
 * 设备路由：list / register(upsert) / rename / revoke
 *
 * 认证方式：Cloudflare Zero Trust（Access）JWT。
 * 设备 ID 由客户端生成并持久化在 localStorage，应用升级/重新登录后保持不变，
 * 因此设备下的剪贴板数据不会丢失。
 */

import type { Env } from "../env"
import { updateDeviceSchema } from "@cloudclipboard/shared"
import { DEVICE_ONLINE_WINDOW_MS } from "@cloudclipboard/shared"
import type { Device } from "@cloudclipboard/types"
import { requireAuth } from "../auth"
import {
  listDevicesByUser,
  upsertDevice,
  getDeviceById,
  updateDeviceBarkUrl,
  updateDeviceLastSeen,
  updateDeviceName,
  deleteDeviceByUser,
  getBarkUrlsByUserExcludingDevice,
  getUserNotificationPrefs,
} from "../db"
import { json, jsonError, notFound } from "./response"
import { detectPlatformFromUA } from "@cloudclipboard/shared"
import { sendBarkNotification } from "../push/bark"

function toDevice(d: {
  id: string
  name: string
  platform: string
  browser: string
  device_type: string
  last_seen: number
  created_at: number
  updated_at: number
  revoked_at: number | null
  bark_url?: string | null
}, now: number): Device {
  const revoked = d.revoked_at !== null
  const online = !revoked && now - d.last_seen < DEVICE_ONLINE_WINDOW_MS
  return {
    id: d.id,
    name: d.name,
    platform: d.platform,
    browser: d.browser,
    device_type: (d.device_type as Device["device_type"]) || "pwa",
    last_seen: d.last_seen,
    created_at: d.created_at,
    updated_at: d.updated_at,
    revoked_at: d.revoked_at,
    online,
    status: revoked ? "revoked" : online ? "trusted" : "offline",
    bark_url: d.bark_url ?? null,
  }
}

// GET /api/devices
export async function handleListDevices(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env)

  const now = Date.now()
  const rows = await listDevicesByUser(env, auth.userId)
  return json({ success: true, devices: rows.map((r) => toDevice(r, now)) })
}

// POST /api/devices/register - 注册/更新当前设备（upsert，幂等）
// 客户端传入稳定的 deviceId（本地持久化），用于设备列表与数据归属。
// 首次注册（新设备）时通过 Bark 通知其他设备。
export async function handleRegisterDevice(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env)

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const id = typeof body?.id === "string" ? body.id.trim().slice(0, 128) : ""
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 128) : ""
  if (!id) return jsonError("VALIDATION_ERROR", "缺少设备 ID")

  const ua = request.headers.get("user-agent") || ""
  const platform = typeof body?.platform === "string" ? body.platform.slice(0, 32) : detectPlatformFromUA(ua)
  const browser = typeof body?.browser === "string" ? body.browser.slice(0, 256) : ""
  const deviceType = typeof body?.device_type === "string" ? body.device_type : "pwa"

  const now = Date.now()

  // 检查是否为新设备（用于首次注册时通知）。带上 user_id 防止跨用户探测（IDOR）
  const existing = await getDeviceById(env, id, auth.userId)
  const isNew = !existing

  await upsertDevice(env, {
    id,
    userId: auth.userId,
    name: name || "我的设备",
    platform,
    browser,
    deviceType,
    now,
  })

  // 新设备首次注册 → 通过 Bark 通知其他设备（尊重用户"新设备加入"偏好）
  if (isNew) {
    try {
      const prefs = await getUserNotificationPrefs(env, auth.userId)
      if (prefs.device_added) {
        const barkUrls = await getBarkUrlsByUserExcludingDevice(env, auth.userId, id)
        const deviceName = name || "我的设备"
        await Promise.allSettled(
          barkUrls.map((url) =>
            sendBarkNotification(url, {
              title: "CloudClipboard",
              body: `📱 新设备「${deviceName}」已加入`,
              group: "cloudclipboard",
            })
          )
        )
      }
    } catch {
      // 通知失败不影响注册
    }
  }

  return json({
    success: true,
    device: { id, name: name || "我的设备", platform, browser, device_type: deviceType },
  }, 201)
}

// PATCH /api/devices/:id
export async function handleUpdateDevice(request: Request, env: Env, deviceId: string): Promise<Response> {
  const auth = await requireAuth(request, env)

  const body = await request.json().catch(() => null)
  const parsed = updateDeviceSchema.safeParse(body)
  if (!parsed.success) return jsonError("VALIDATION_ERROR", "无效请求体")

  if (parsed.data.name) {
    await updateDeviceName(env, deviceId, auth.userId, parsed.data.name)
  }
  if (parsed.data.bark_url !== undefined) {
    await updateDeviceBarkUrl(env, deviceId, auth.userId, parsed.data.bark_url)
  }

  const now = Date.now()
  const rows = await listDevicesByUser(env, auth.userId)
  const updated = rows.find((d) => d.id === deviceId)
  if (!updated) return notFound("设备不存在")

  return json({ success: true, device: toDevice(updated, now) })
}

// DELETE /api/devices/:id
export async function handleDeleteDevice(request: Request, env: Env, deviceId: string): Promise<Response> {
  const auth = await requireAuth(request, env)

  // 删除该设备及其产生的剪贴板记录（含 R2 文件）
  await deleteDeviceByUser(env, deviceId, auth.userId)
  return json({ success: true })
}
