/**
 * 本地存储（§55）
 *
 * 敏感数据（Encryption Key / Device Token）→ IndexedDB
 * 普通数据（theme / language / preferences）→ localStorage
 */

import type { AppConfig, ThemeMode } from "@cloudclipboard/types"
import { detectPlatformClient, getDefaultPlatformName } from "@cloudclipboard/shared"

// ──────────────────────────────
// localStorage（普通偏好）
// ──────────────────────────────

const CONFIG_KEY = "cloudclip_config"
const NOTIFICATION_KEY = "cloudclip_notifications"

function getDefaultDeviceId(): string {
  const platform = detectPlatformClient()
  // 使用密码学安全随机源，避免 Math.random() 低熵导致设备 ID 重复/可预测
  return `${platform}-${crypto.randomUUID().slice(0, 8)}`
}

function getDefaultDeviceName(): string {
  return getDefaultPlatformName(detectPlatformClient())
}

export const defaultConfig: AppConfig = {
  workerUrl: "",
  deviceId: getDefaultDeviceId(),
  deviceName: getDefaultDeviceName(),
  theme: "system",
}

const VALID_THEMES: ThemeMode[] = ["system", "light", "dark"]

function normalizeTheme(raw: unknown): ThemeMode {
  return VALID_THEMES.includes(raw as ThemeMode) ? (raw as ThemeMode) : "system"
}

/** 读取非敏感配置（localStorage 不含 token/密钥） */
export function loadConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return { ...defaultConfig }
    const parsed = JSON.parse(raw)
    return {
      ...defaultConfig,
      ...parsed,
      theme: normalizeTheme(parsed.theme),
    }
  } catch {
    return { ...defaultConfig }
  }
}

/** 保存非敏感配置 */
export function saveConfig(cfg: AppConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg))
}

// ──────────────────────────────
// Notification preferences
// ──────────────────────────────

export interface NotificationPrefs {
  new_clipboard: boolean
  device_online: boolean
  device_added: boolean
  security_alert: boolean
}

const DEFAULT_PREFS: NotificationPrefs = {
  new_clipboard: true,
  device_online: false,
  device_added: true,
  security_alert: true,
}

export function loadNotificationPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(NOTIFICATION_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function saveNotificationPrefs(prefs: NotificationPrefs): void {
  localStorage.setItem(NOTIFICATION_KEY, JSON.stringify(prefs))
}

// ──────────────────────────────
// Pins（收藏）
// ──────────────────────────────

const PINS_KEY = "cloudclip_pins"

export function loadPins(): string[] {
  try {
    const raw = localStorage.getItem(PINS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function savePins(pins: string[]): void {
  localStorage.setItem(PINS_KEY, JSON.stringify(pins))
}
