/**
 * CloudClipboard Worker 主入口
 *
 * 认证方式：Cloudflare Zero Trust（Access）在边缘完成登录验证。
 * Worker 不再做任何登录验证 / 密钥认证，仅从 Access 注入的
 * `CF-Access-Authenticated-User-Email` 请求头读取用户邮箱，
 * 派生稳定 userId 用于数据隔离（见 auth/index.ts）。
 *
 * 剪贴板内容始终为客户端 AES-256-GCM 端到端加密密文，服务器只存密文。
 *
 * API 列表:
 *   GET    /api/health                   健康检查
 *   GET    /api/auth/done                Access 登录完成 → 302 跳回 App（iOS）
 *   GET    /api/me                       当前用户身份（稳定 userId）
 *   GET    /api/prefs                    用户偏好（跨设备同步，当前为主题）
 *   PUT    /api/prefs                    更新用户偏好
 *   GET    /api/devices                  设备列表
 *   POST   /api/devices/register         注册/更新当前设备（upsert）
 *   PATCH  /api/devices/:id              重命名设备
 *   DELETE /api/devices/:id              删除设备（含其剪贴板记录）
 *   POST   /api/push/test                Bark 测试
 *   GET    /api/clipboard                剪贴板列表
 *   POST   /api/clipboard                上传剪贴板（E2EE 密文）
 *   POST   /api/clipboard/plain          curl 明文上传（API Token）
 *   GET    /api/clipboard/:id            单个剪贴板
 *   DELETE /api/clipboard/:id            删除剪贴板
 *   GET    /api/tokens                   API Token 列表
 *   POST   /api/tokens                   生成 API Token
 *   DELETE /api/tokens/:id               吊销 API Token
 *   POST   /api/files/upload             R2 文件上传（客户端加密）
 *   GET    /api/files/:key               R2 文件读取
 */

import type { Env } from "./env"
import { corsOptions, internalError, jsonError, setCorsOrigin, tooManyRequests, unauthorized } from "./routes/response"
import { checkRateLimit, inferRateLimitKey } from "./routes/ratelimit"
import { handleHealth } from "./routes/health"
import { handleMe } from "./routes/me"
import { handleGetPrefs, handleUpdatePrefs } from "./routes/prefs"
import { handleListDevices, handleRegisterDevice, handleUpdateDevice, handleDeleteDevice } from "./routes/devices"
import { handlePushTest } from "./routes/push"
import { handleClipboardList, handleClipboardCreate, handleClipboardGet, handleClipboardDelete, handleClipboardPlainCreate } from "./routes/clipboard"
import { handleListTokens, handleCreateToken, handleRevokeToken } from "./routes/tokens"
import { handleAuthDone } from "./routes/auth"
import { handleFileUpload, handleFileGet } from "./routes/files"
import { handleScheduled } from "./cron"

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 记录本次请求允许的 CORS 来源，供 json() 等助手使用
    setCorsOrigin(request, env)

    try {
      return await handleRequest(request, env)
    } catch (err) {
      // 全局异常兜底：任何未捕获异常都以合法 JSON 返回，
      // 避免 Cloudflare 运行时返回默认 HTML 错误页（前端无法解析）。
      console.error("[worker] 未捕获异常:", err)
      // 认证失败（缺身份头）应返回 401，而非 500
      if (err instanceof Error && err.message === "AUTH_MISSING_IDENTITY") {
        return unauthorized("缺少认证身份，请确认 Cloudflare Access 已正确配置")
      }
      return internalError(err instanceof Error ? err.message : undefined)
    }
  },

  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    await handleScheduled(env)
  },
}

/**
 * 实际的请求处理逻辑，由 fetch 入口在 try/catch 中调用，
 * 保证任何未捕获异常都以统一 JSON 错误格式返回。
 */
async function handleRequest(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return corsOptions(request, env)
  }

  const url = new URL(request.url)
  const p = url.pathname

  // 健康检查公开（不鉴权）
  if (p === "/api/health" && request.method === "GET") {
    return handleHealth(env)
  }

  // Access 登录完成跳转（供 iOS ASWebAuthenticationSession 回调；边缘 Access 已 gate）
  if (p === "/api/auth/done" && request.method === "GET") {
    return handleAuthDone()
  }

  // 当前用户身份（供前端派生 salt）
  if (p === "/api/me" && request.method === "GET") {
    return handleMe(request, env)
  }

  // 速率限制（排除 health）
  const rateLimitKey = inferRateLimitKey(request.method, p)
  const rl = await checkRateLimit(env, request, rateLimitKey)
  if (!rl.allowed) {
    const res = tooManyRequests()
    if (rl.retryAfterSec) {
      res.headers.set("Retry-After", String(rl.retryAfterSec))
    }
    return res
  }

  // 用户偏好（跨设备同步：主题）
  if (p === "/api/prefs" && request.method === "GET") return handleGetPrefs(request, env)
  if (p === "/api/prefs" && request.method === "PUT") return handleUpdatePrefs(request, env)

  // Devices
  if (p === "/api/devices" && request.method === "GET") return handleListDevices(request, env)
  if (p === "/api/devices/register" && request.method === "POST") return handleRegisterDevice(request, env)
  const deviceMatch = /^\/api\/devices\/([^/]+)$/.exec(p)
  if (deviceMatch && request.method === "PATCH") return handleUpdateDevice(request, env, decodeURIComponent(deviceMatch[1]))
  if (deviceMatch && request.method === "DELETE") return handleDeleteDevice(request, env, decodeURIComponent(deviceMatch[1]))

  // Push (Bark)
  if (p === "/api/push/test" && request.method === "POST") return handlePushTest(request, env)

  // Clipboard
  if (p === "/api/clipboard" && request.method === "GET") return handleClipboardList(request, env)
  if (p === "/api/clipboard" && request.method === "POST") return handleClipboardCreate(request, env)
  // curl 友好明文上传（配合 API Token）
  if (p === "/api/clipboard/plain" && request.method === "POST") return handleClipboardPlainCreate(request, env)
  const clipMatch = /^\/api\/clipboard\/([^/]+)$/.exec(p)
  if (clipMatch && request.method === "GET") return handleClipboardGet(request, env, decodeURIComponent(clipMatch[1]))
  if (clipMatch && request.method === "DELETE") return handleClipboardDelete(request, env, decodeURIComponent(clipMatch[1]))

  // API Tokens
  if (p === "/api/tokens" && request.method === "GET") return handleListTokens(request, env)
  if (p === "/api/tokens" && request.method === "POST") return handleCreateToken(request, env)
  const tokenMatch = /^\/api\/tokens\/([^/]+)$/.exec(p)
  if (tokenMatch && request.method === "DELETE") return handleRevokeToken(request, env, decodeURIComponent(tokenMatch[1]))

  // Files
  if (p === "/api/files/upload" && request.method === "POST") return handleFileUpload(request, env)
  const fileMatch = /^\/api\/files\/([^/]+)$/.exec(p)
  if (fileMatch && request.method === "GET") return handleFileGet(request, env, decodeURIComponent(fileMatch[1]))

  // 未知 API 路由
  if (p.startsWith("/api/")) {
    return jsonError("NOT_FOUND", "接口不存在", 404)
  }

  // 非 API 路径交给静态资源（wrangler assets SPA fallback）
  return new Response("Not Found", { status: 404 })
}

export type { Env }
