/**
 * Web 端 API 客户端
 * 与 Worker API 对接，E2EE 加密由上层调用 @cloudclipboard/crypto 完成
 *
 * 认证方式：Cloudflare Zero Trust（Access）。
 * Worker 置于 Access 之后，浏览器请求自动携带 CF-Access-Jwt-Assertion，
 * 客户端无需管理任何 token。设备身份通过 x-device-id / x-device-name 头传递。
 */

import type {
  ApiBase,
  ClipboardItem,
  ClipboardType,
  Device,
  ApiToken,
  ClipboardListResponse,
  ClipboardItemResponse,
  ClipboardCreateResponse,
  DeviceResponse,
  DeviceListResponse,
  TokenListResponse,
  TokenCreateResponse,
  PushTestResponse,
  SimpleResponse,
  PrefsResponse,
  UserPrefs,
  ThemeMode,
  MeResponse,
} from "@cloudclipboard/types"
import { detectPlatformClient, CLIPBOARD_LIST_LIMIT } from "@cloudclipboard/shared"

export interface RegisterResult {
  device: { id: string; name: string; platform: string }
}

/**
 * 会话过期专用错误码：由 parse() 统一识别并抛出。
 * 上层（useApp）捕获该码后切换为 sessionExpired 状态，弹出重登覆盖层。
 */
export const SESSION_EXPIRED = "SESSION_EXPIRED"

export class ApiError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

export class ApiClient {
  constructor(
    private getWorkerUrl: () => string,
    private getDeviceId: () => string,
    private getDeviceName: () => string
  ) {}

  private get base(): string {
    return this.getWorkerUrl().trim().replace(/\/+$/, "")
  }

  private headers(jsonBody = false): HeadersInit {
    const h: Record<string, string> = {}
    if (jsonBody) h["Content-Type"] = "application/json"
    const deviceId = this.getDeviceId()
    const deviceName = this.getDeviceName()
    if (deviceId) h["x-device-id"] = deviceId
    if (deviceName) h["x-device-name"] = deviceName
    return h
  }

  private async parse<T>(res: Response): Promise<T> {
    const text = await res.text()
    let data: unknown
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      throw new ApiError("INVALID_RESPONSE", `响应不是合法 JSON (HTTP ${res.status})`, res.status)
    }
    const api = data as ApiBase
    if (!res.ok || api.success === false) {
      const code = api.error?.code || "API_ERROR"
      const message = api.error?.message || `请求失败 (${res.status})`
      // 会话过期：Access 登录失效 / 被拒，Worker 返回 401 UNAUTHORIZED，
      // 或后端显式标记 SESSION_EXPIRED → 统一映射到前端专用错误码。
      if (isSessionExpired(res.status, code)) {
        throw new ApiError(SESSION_EXPIRED, message, res.status)
      }
      throw new ApiError(code, message, res.status)
    }
    return data as T
  }

  // ──────────────────────────────
  // Device（CF Access 身份下注册当前设备）
  // ──────────────────────────────

  /** 注册/更新当前设备（upsert，幂等），应用升级后 deviceId 不变 → 数据保留 */
  async registerDevice(id: string, name: string): Promise<RegisterResult> {
    const res = await fetch(`${this.base}/api/devices/register`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({
        id,
        name,
        platform: detectPlatform(),
        browser: navigator.userAgent,
        device_type: "pwa",
      }),
    })
    const data = await this.parse<DeviceResponse>(res)
    return {
      device: data.device as RegisterResult["device"],
    }
  }

  // ──────────────────────────────
  // Devices
  // ──────────────────────────────

  async fetchDevices(): Promise<Device[]> {
    const res = await fetch(`${this.base}/api/devices`, {
      headers: this.headers(),
    })
    const data = await this.parse<DeviceListResponse>(res)
    return data.devices
  }

  async renameDevice(deviceId: string, name: string): Promise<Device> {
    const res = await fetch(`${this.base}/api/devices/${deviceId}`, {
      method: "PATCH",
      headers: this.headers(true),
      body: JSON.stringify({ name }),
    })
    const data = await this.parse<DeviceResponse>(res)
    return data.device
  }

  async setDeviceBarkUrl(deviceId: string, barkUrl: string): Promise<Device> {
    const res = await fetch(`${this.base}/api/devices/${deviceId}`, {
      method: "PATCH",
      headers: this.headers(true),
      body: JSON.stringify({ bark_url: barkUrl }),
    })
    const data = await this.parse<DeviceResponse>(res)
    return data.device
  }

  async testBark(barkUrl: string): Promise<boolean> {
    const res = await fetch(`${this.base}/api/push/test`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({ barkUrl }),
    })
    const data = await this.parse<PushTestResponse>(res)
    return data.success
  }

  async deleteDevice(deviceId: string): Promise<boolean> {
    const res = await fetch(`${this.base}/api/devices/${deviceId}`, {
      method: "DELETE",
      headers: this.headers(),
    })
    await this.parse<SimpleResponse>(res)
    return true
  }

  // ──────────────────────────────
  // 用户身份（/api/me，需鉴权，可用于 Access 会话探活）
  // ──────────────────────────────

  /** 当前登录用户（Access JWT 校验通过后返回） */
  async fetchMe(): Promise<MeResponse> {
    const res = await fetch(`${this.base}/api/me`, {
      headers: this.headers(),
      cache: "no-store",
    })
    return this.parse<MeResponse>(res)
  }

  // ──────────────────────────────
  // 用户偏好（跨设备同步：主题）
  // ──────────────────────────────

  /** 拉取云端用户偏好（主题），登录后调用以应用其他设备的设置 */
  async fetchPrefs(): Promise<UserPrefs> {
    const res = await fetch(`${this.base}/api/prefs`, {
      headers: this.headers(),
    })
    const data = await this.parse<PrefsResponse>(res)
    return data.prefs
  }

  /** 推送主题到云端，其他设备拉取后自动应用 */
  async updateTheme(theme: ThemeMode): Promise<UserPrefs> {
    const res = await fetch(`${this.base}/api/prefs`, {
      method: "PUT",
      headers: this.headers(true),
      body: JSON.stringify({ theme }),
    })
    const data = await this.parse<PrefsResponse>(res)
    return data.prefs
  }

  /** 推送通知偏好到云端（部分更新） */
  async updateNotificationPrefs(prefs: {
    new_clipboard?: boolean
    device_online?: boolean
    device_added?: boolean
    security_alert?: boolean
  }): Promise<UserPrefs> {
    const res = await fetch(`${this.base}/api/prefs`, {
      method: "PUT",
      headers: this.headers(true),
      body: JSON.stringify({ notification: prefs }),
    })
    const data = await this.parse<PrefsResponse>(res)
    return data.prefs
  }

  // ──────────────────────────────
  // API Tokens（curl / CLI 调用认证）
  // ──────────────────────────────

  async fetchApiTokens(): Promise<ApiToken[]> {
    const res = await fetch(`${this.base}/api/tokens`, {
      headers: this.headers(),
    })
    const data = await this.parse<TokenListResponse>(res)
    return Array.isArray(data.tokens) ? data.tokens : []
  }

  /** 创建 API Token，返回明文 token（仅此一次展示） */
  async createApiToken(name: string, expiresIn?: number): Promise<{ id: string; api_token: string }> {
    const res = await fetch(`${this.base}/api/tokens`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({ name, expires_in: expiresIn }),
    })
    const data = await this.parse<TokenCreateResponse>(res)
    const token = data.token
    return {
      id: token.id,
      api_token: token.api_token,
    }
  }

  async deleteApiToken(id: string): Promise<boolean> {
    const res = await fetch(`${this.base}/api/tokens/${id}`, {
      method: "DELETE",
      headers: this.headers(),
    })
    await this.parse<SimpleResponse>(res)
    return true
  }

  // ──────────────────────────────
  // Clipboard
  // ──────────────────────────────

  /**
   * 拉取剪贴板列表（最多 limit 条，服务端上限 200）。
   * 注意：列表是"最新 N 条"而非全部——UI 需把 limit 明确展示给用户，
   * 否则更早的记录会看起来像"丢失"（实际仍在库里）。
   */
  async fetchClipboardList(limit = CLIPBOARD_LIST_LIMIT): Promise<ClipboardItem[]> {
    const res = await fetch(`${this.base}/api/clipboard?limit=${limit}`, {
      headers: this.headers(),
    })
    const data = await this.parse<ClipboardListResponse>(res)
    return data.items
  }

  async fetchClipboardItem(id: string): Promise<ClipboardItem> {
    const res = await fetch(`${this.base}/api/clipboard/${id}`, {
      headers: this.headers(),
    })
    const data = await this.parse<ClipboardItemResponse>(res)
    return data.item
  }

  /**
   * 上传剪贴板（已加密密文，调用方负责 E2EE）
   */
  async pushClipboard(input: {
    type: ClipboardType
    encrypted_data: string
    iv: string
    salt?: string | null
    wrapped_key?: string | null
    r2_key?: string | null
    size?: number | null
    mime_type?: string | null
    filename?: string | null
    expires_in?: number | null
  }): Promise<ClipboardItem> {
    const res = await fetch(`${this.base}/api/clipboard`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify(input),
    })
    const data = await this.parse<ClipboardCreateResponse>(res)
    return data.item
  }

  async deleteClipboard(id: string): Promise<boolean> {
    const res = await fetch(`${this.base}/api/clipboard/${id}`, {
      method: "DELETE",
      headers: this.headers(),
    })
    await this.parse<SimpleResponse>(res)
    return true
  }
}

/**
 * 判断响应是否代表会话过期。
 * - 401：Access 凭据失效（未认证 / 登录过期 / 被拒）
 * - 错误码 UNAUTHORIZED / SESSION_EXPIRED / EXPIRED：显式标记
 */
export function isSessionExpired(status: number, code?: string): boolean {
  if (status === 401) return true
  const normalized = (code || "").toUpperCase()
  return normalized === "UNAUTHORIZED" || normalized === "SESSION_EXPIRED" || normalized === "EXPIRED"
}

/** 检测当前平台（使用 shared 的客户端增强检测，正确识别 iPadOS） */
function detectPlatform(): string {
  return detectPlatformClient()
}
