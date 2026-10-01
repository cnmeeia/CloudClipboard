/**
 * CloudClipboard 共享常量、枚举与 Zod Schema
 */

import { z } from "zod"

// ──────────────────────────────
// 常量
// ──────────────────────────────

export const SERVICE_NAME = "CloudClipboard"
export const SERVICE_VERSION = "2.0.0"

/** 剪贴板默认 TTL（7 天，毫秒） */
export const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** 可选的 TTL 预设（毫秒） */
export const TTL_PRESETS_MS = [
  60 * 60 * 1000, // 1 hour
  24 * 60 * 60 * 1000, // 1 day
  7 * 24 * 60 * 60 * 1000, // 7 days
  30 * 24 * 60 * 60 * 1000, // 30 days
] as const

/** 配对 token 有效期（10 分钟） */
export const PAIRING_TOKEN_TTL_MS = 10 * 60 * 1000

/** OTP 有效期（5 分钟） */
export const OTP_TTL_MS = 5 * 60 * 1000

/** 设备在线判定窗口（5 分钟） */
export const DEVICE_ONLINE_WINDOW_MS = 5 * 60 * 1000

/** 前端轮询间隔（30 秒） */
export const CLIPBOARD_POLL_INTERVAL_MS = 30_000

/**
 * 剪贴板列表默认拉取条数。
 * 列表是「最新 N 条」视图，超过该数量的更早记录仍在库中但不会显示，
 * UI 必须显式提示，避免被误认为「记录丢失」。
 */
export const CLIPBOARD_LIST_LIMIT = 200

/** 文件大小上限（50 MB） */
export const MAX_FILE_SIZE = 50 * 1024 * 1024

/** 配额（默认每个用户 500 MB） */
export const DEFAULT_STORAGE_QUOTA = 500 * 1024 * 1024

// ──────────────────────────────
// Rate Limit 配置（§58）
// ──────────────────────────────

export const RATE_LIMITS: Record<string, { limit: number; windowMs: number }> = {
  "devices:register": { limit: 10, windowMs: 60_000 },
  "clipboard:list": { limit: 120, windowMs: 60_000 },
  "clipboard:create": { limit: 120, windowMs: 60_000 },
  "files:upload": { limit: 30, windowMs: 60_000 },
  "prefs:update": { limit: 30, windowMs: 60_000 },
  "default": { limit: 200, windowMs: 60_000 },
}

// ──────────────────────────────
// Zod Schemas（§64）
// ──────────────────────────────

export const clipboardTypeSchema = z.enum(["text", "url", "code", "image", "file"])

export const registerDeviceSchema = z.object({
  device_name: z.string().trim().min(1).max(128),
  platform: z.string().trim().max(32).optional(),
  browser: z.string().trim().max(256).optional(),
  device_type: z.enum(["pwa", "cli", "extension", "other"]).optional(),
})

export const createClipboardSchema = z.object({
  type: clipboardTypeSchema,
  encrypted_data: z.string().min(1),
  iv: z.string().min(1),
  salt: z.string().optional().nullable(),
  wrapped_key: z.string().optional().nullable(),
  r2_key: z.string().optional().nullable(),
  size: z.number().int().nonnegative().optional().nullable(),
  mime_type: z.string().max(256).optional().nullable(),
  filename: z.string().max(255).optional().nullable(),
  expires_in: z.number().int().positive().optional().nullable(),
})

export const updateDeviceSchema = z.object({
  name: z.string().trim().min(1).max(128).optional(),
  bark_url: z
    .string()
    .trim()
    .max(512)
    .refine(
      (v) => v === "" || /^https?:\/\/[^\s/$.?#].[^\s]*\/[A-Za-z0-9._-]+\/?$/.test(v),
      { message: "Bark URL 格式不正确，应为 https://host/DEVICEKEY" },
    )
    .optional(),
})

/** 用户偏好（跨设备同步）schema：主题三态 */
/** 通知偏好（四类开关，默认全部开启） */
export interface NotificationPrefs {
  /** 其他设备复制内容时通知我 */
  new_clipboard: boolean
  /** 设备上线 / 离线时通知我 */
  device_online: boolean
  /** 有新设备加入时通知我 */
  device_added: boolean
  /** 安全事件（异常登录等）通知我 */
  security_alert: boolean
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  new_clipboard: true,
  device_online: false,
  device_added: true,
  security_alert: true,
}

/**
 * 用户偏好部分更新：theme / notification 各自可选，缺失字段保留原值。
 * 至少需要一个字段——空对象属于误调用，直接拒绝（避免无意义写入）。
 */
export const updatePrefsSchema = z
  .object({
    theme: z.enum(["system", "light", "dark"]).optional(),
    // 通知偏好：四类布尔开关，客户端可部分更新（缺失字段保留原值）
    notification: z.object({
      new_clipboard: z.boolean().optional(),
      device_online: z.boolean().optional(),
      device_added: z.boolean().optional(),
      security_alert: z.boolean().optional(),
    }).optional(),
  })
  .refine((v) => v.theme !== undefined || v.notification !== undefined, {
    message: "至少需要提供 theme 或 notification 中的一个",
  })

// ──────────────────────────────
// 平台 / 设备工具
// ──────────────────────────────

/**
 * 平台检测（UA 优先，前后端共用）。
 *
 * iPadOS 13+ Safari 将 UA 伪装为 Macintosh（不携带 iPad 标记），
 * 通过额外特征区分：若同时命中 Macintosh 与 iPad 相关提示（Version/15_ Safari），
 * 仍识别为 ipad——但 Worker 端只有 UA 字符串可用，
 * 因此这里按以下顺序 + 特征推断：
 *   1. iPhone / iPod → ios
 *   2. 含 iPad → ipad（较旧 iOS 或请求桌面版时包含）
 *   3. Macintosh + Safari + touch 类特征不可见时回退 mac
 *
 * 注意：iPadOS 13+ 的 Safari UA 为 "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
 * 不含 "iPad" 字样，无法从 UA 直接区分。前端应通过 navigator.platform/maxTouchPoints 辅助判断。
 */
export function detectPlatformFromUA(ua: string): string {
  if (!ua) return "web"
  // iPadOS 请求桌面版 Safari 也会包含 iPad 标记
  if (/iPhone|iPod/.test(ua)) return "ios"
  if (/iPad/.test(ua)) return "ipad"
  // iPadOS 13+ 的 UA 含 Macintosh + Safari + "Version/数字"。若同时看到 Safari 与 Macintosh，
  // 无法仅从 UA 区分 iPad 与 Mac（需配合 navigator.maxTouchPoints）。
  // 这里保持"mac"正确识别，前端通过增强检测修正为 ipad。
  if (/Macintosh|Mac OS X/.test(ua)) return "mac"
  if (/Android/.test(ua)) return "android"
  if (/Windows/.test(ua)) return "windows"
  if (/Linux/.test(ua)) return "linux"
  return "web"
}

/**
 * 客户端增强平台检测（解决 iPadOS 13+ UA 伪装为 Macintosh 的问题）。
 * 浏览器端可用 navigator.platform / maxTouchPoints 辅助判断。
 */
export function detectPlatformClient(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : ""
  if (!ua) return "web"

  // 先做基础 UA 检测
  if (/iPhone|iPod/.test(ua)) return "ios"
  if (/iPad/.test(ua)) return "ipad"
  if (/Android/.test(ua)) return "android"
  if (/Windows/.test(ua)) return "windows"
  if (/Linux/.test(ua)) return "linux"

  // iPadOS 13+：UA 伪装为 Macintosh，但可通过触摸点数量区分
  if (/Macintosh|Mac OS X/.test(ua)) {
    const isIPad =
      typeof navigator !== "undefined" &&
      (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints !== undefined &&
      (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints! > 1
    return isIPad ? "ipad" : "mac"
  }

  return "web"
}

/** 平台默认设备名（客户端友好） */
export function getDefaultPlatformName(platform: string): string {
  switch (platform) {
    case "mac": return "MacBook (PWA)"
    case "ios": return "iPhone (PWA)"
    case "ipad": return "iPad (PWA)"
    case "android": return "Android Phone"
    case "windows": return "Windows PC"
    case "linux": return "Linux PC"
    case "web": return "Web Browser"
    default: return "我的设备"
  }
}
