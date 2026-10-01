/**
 * CloudClipboard 共享类型定义
 * 前后端（Web / Worker）共用，保持单一事实来源
 */

// ──────────────────────────────
// Clipboard
// ──────────────────────────────

export type ClipboardType = "text" | "url" | "code" | "image" | "file"

export interface ClipboardItem {
  id: string
  user_id: string
  device_id: string
  device_name: string
  type: ClipboardType
  /** AES-256-GCM 密文（base64url） */
  encrypted_data: string | null
  /** 加密 IV（base64url） */
  iv: string | null
  /** 密钥包装用的 salt（base64url，跨设备 master key 交换用） */
  salt: string | null
  /** master key 包装的 item key（base64url，V2 新格式） */
  wrapped_key?: string | null
  /** R2 对象 key（文件/图片类型） */
  r2_key: string | null
  size: number | null
  mime_type: string | null
  filename: string | null
  created_at: number
  expires_at: number | null
  /** 解密后的明文（仅前端本地填充，永不回传服务器） */
  content?: string
  /** 是否收藏（前端本地标记，V2 可服务端化） */
  pinned?: boolean
  /** 是否明文存储（API Token / curl 上传，未做 E2EE，encrypted_data 即明文） */
  plain?: number
}

export interface ClipboardItemCreateInput {
  type: ClipboardType
  encrypted_data: string
  iv: string
  salt?: string | null
  r2_key?: string | null
  size?: number | null
  mime_type?: string | null
  filename?: string | null
  expires_in?: number | null
}

// ──────────────────────────────
// Devices
// ──────────────────────────────

export type DeviceStatus = "trusted" | "pending" | "revoked" | "offline"

export interface Device {
  id: string
  name: string
  platform: string
  browser: string
  device_type: "pwa" | "cli" | "extension" | "other"
  last_seen: number
  created_at: number
  updated_at: number
  revoked_at: number | null
  online: boolean
  status: DeviceStatus
  bark_url?: string | null
}

export interface DeviceInfoRow {
  id: string
  user_id: string
  name: string
  platform: string
  browser: string
  device_type: string
  last_seen: number
  created_at: number
  updated_at: number
  revoked_at: number | null
  bark_url?: string | null
}

// ──────────────────────────────
// API Token（curl / CLI 调用认证）
// ──────────────────────────────

export interface ApiToken {
  id: string
  name: string
  created_at: number
  last_used_at: number | null
  expires_at: number | null
}

// ──────────────────────────────
// API Response 统一格式
// ──────────────────────────────
//
// 设计说明：为每个端点定义按职责收窄的响应类型，避免使用一个超宽泛型
// （旧 `ApiResponse`）导致编译器不约束任何字段。所有端点共享 `ApiBase`，
// 各自的返回结构以字段是否必选来精确描述。

/** 所有 API 响应共有的基座（错误时携带 error，成功时不含） */
export interface ApiBase {
  success: boolean
  error?: ApiErrorBody
}

export interface ApiErrorBody {
  code: string
  message: string
}

/** 设备注册响应（PATCH/POST register 均返回单个 device 视图） */
export interface DeviceResponse extends ApiBase {
  device: Device
}

/** 设备列表响应（GET /api/devices） */
export interface DeviceListResponse extends ApiBase {
  devices: Device[]
}

/** 剪贴板列表响应（GET /api/clipboard） */
export interface ClipboardListResponse extends ApiBase {
  items: ClipboardItem[]
  count: number
}

/** 单个剪贴板条目响应（GET /api/clipboard/:id） */
export interface ClipboardItemResponse extends ApiBase {
  item: ClipboardItem
}

/**
 * 创建剪贴板响应（POST /api/clipboard 与 POST /api/clipboard/plain）。
 * plain 端点额外返回 note 说明，此处可选保留。
 */
export interface ClipboardCreateResponse extends ApiBase {
  item: ClipboardItem
  push: {
    sent: number
    total: number
  }
  note?: string
}

/** API Token 列表响应（GET /api/tokens） */
export interface TokenListResponse extends ApiBase {
  tokens: ApiToken[]
  count: number
}

/** 创建 API Token 响应（POST /api/tokens，明文 token 仅此一次返回） */
export interface TokenCreateResponse extends ApiBase {
  token: {
    id: string
    name: string
    created_at: number
    expires_at: number | null
    api_token: string
  }
  note?: string
}

/** 当前用户身份响应（GET /api/me，仅返回非敏感的稳定 userId） */
export interface MeResponse extends ApiBase {
  user: {
    id: string
  }
}

/** 通知偏好类型（与 shared 保持一致） */
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

/** 用户级偏好（跨设备同步）。主题 + 通知偏好 */
export interface UserPrefs {
  theme: ThemeMode
  notification: NotificationPrefs
}

/** 用户偏好响应（GET /api/prefs） */
export interface PrefsResponse extends ApiBase {
  prefs: UserPrefs
}

/** Bark 推送测试响应（POST /api/push/test） */
export interface PushTestResponse extends ApiBase {
  message?: string
}

/** 文件上传响应（POST /api/files/upload） */
export interface FileUploadResponse extends ApiBase {
  r2_key: string
  item_id: string
  size: number
  mime_type: string
  filename: string
}

/** 健康检查响应（GET /api/health） */
export interface HealthResponse extends ApiBase {
  service: string
  version: string
  timestamp: number
  checks: Record<string, boolean>
}

/** 无响应体的操作结果（DELETE 系列，仅 success） */
export interface SimpleResponse extends ApiBase {}

/**
 * 通用别名：当调用方只关心 success/error 时使用。
 * @deprecated 各端点请改用上述按职责收窄的响应类型。
 */
export type ApiResponse = ApiBase

// ──────────────────────────────
// 前端 App 配置
// ──────────────────────────────

export type ThemeMode = "system" | "light" | "dark"

export interface AppConfig {
  workerUrl: string
  deviceId: string
  deviceName: string
  theme: ThemeMode
}
