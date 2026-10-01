/**
 * 用户偏好路由：GET/PUT /api/prefs（跨设备同步）
 *
 * 支持两类偏好（按账号 userId 存储，任意设备变更全局生效）：
 * - theme: "system" | "light" | "dark"
 * - notification: 四个布尔开关（剪贴板通知 / 设备在线 / 新设备加入 / 安全提醒）
 *
 * 认证：与其余路由一致，requireAuth（Access 身份 / API Token）。
 */

import type { Env } from "../env"
import type { ThemeMode } from "@cloudclipboard/types"
import { requireAuth } from "../auth"
import { updatePrefsSchema, DEFAULT_NOTIFICATION_PREFS } from "@cloudclipboard/shared"
import { getUserTheme, upsertUserTheme, getUserNotificationPrefs, upsertUserNotificationPrefs } from "../db"
import { json, jsonError } from "./response"

/** 未显式设置时的兜底主题（与前端默认一致） */
const DEFAULT_THEME: ThemeMode = "system"

function normalizeTheme(raw: string | null): ThemeMode {
  return raw === "light" || raw === "dark" ? raw : DEFAULT_THEME
}

// GET /api/prefs - 拉取当前用户的云端偏好（主题 + 通知偏好）
export async function handleGetPrefs(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env)
  const storedTheme = await getUserTheme(env, auth.userId)
  const notif = await getUserNotificationPrefs(env, auth.userId)
  return json({
    success: true,
    prefs: {
      theme: normalizeTheme(storedTheme),
      notification: {
        new_clipboard: notif.new_clipboard ?? DEFAULT_NOTIFICATION_PREFS.new_clipboard,
        device_online: notif.device_online ?? DEFAULT_NOTIFICATION_PREFS.device_online,
        device_added: notif.device_added ?? DEFAULT_NOTIFICATION_PREFS.device_added,
        security_alert: notif.security_alert ?? DEFAULT_NOTIFICATION_PREFS.security_alert,
      },
    },
  })
}

// PUT /api/prefs - 更新当前用户的云端偏好（支持部分更新：theme 或 notification）
// body 示例：{ "theme": "dark" } 或 { "notification": { "new_clipboard": false } }
export async function handleUpdatePrefs(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env)

  const body = await request.json().catch(() => null)
  const parsed = updatePrefsSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError("VALIDATION_ERROR", "无效偏好设置。主题应为 system/light/dark；通知偏好为布尔值")
  }

  const data = parsed.data

  // 部分更新：只更新传了的部分
  if (data.theme !== undefined) {
    await upsertUserTheme(env, auth.userId, data.theme)
  }
  if (data.notification) {
    await upsertUserNotificationPrefs(env, auth.userId, data.notification)
  }

  // 返回合并后的最新偏好
  const storedTheme = await getUserTheme(env, auth.userId)
  const notif = await getUserNotificationPrefs(env, auth.userId)
  return json({
    success: true,
    prefs: {
      theme: normalizeTheme(storedTheme),
      notification: {
        new_clipboard: notif.new_clipboard ?? DEFAULT_NOTIFICATION_PREFS.new_clipboard,
        device_online: notif.device_online ?? DEFAULT_NOTIFICATION_PREFS.device_online,
        device_added: notif.device_added ?? DEFAULT_NOTIFICATION_PREFS.device_added,
        security_alert: notif.security_alert ?? DEFAULT_NOTIFICATION_PREFS.security_alert,
      },
    },
  })
}
