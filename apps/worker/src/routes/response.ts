/**
 * 统一 API 响应格式（§59）
 * { success: false, error: { code, message } }
 */

import type { ApiErrorBody } from "@cloudclipboard/types"

// ──────────────────────────────
// CORS / 安全响应头
// ──────────────────────────────

const DEFAULT_ALLOWED_ORIGINS = [
  "https://clip.0272.de5.net",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}

/**
 * 解析允许的跨域来源。优先使用 env.ALLOWED_ORIGINS（逗号分隔），
 * 未配置时回退到内置默认白名单。
 */
export function resolveAllowedOrigins(env?: { ALLOWED_ORIGINS?: string }): string[] {
  if (env?.ALLOWED_ORIGINS) {
    return env.ALLOWED_ORIGINS.split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return DEFAULT_ALLOWED_ORIGINS
}

/**
 * 根据请求的 Origin 头与允许来源白名单，返回应下发的 Access-Control-Allow-Origin。
 * 同源请求（无 Origin 头）不返回 CORS 头。
 * 拒绝不在白名单内的跨域来源。
 */
export function resolveCorsOrigin(request: Request, env?: { ALLOWED_ORIGINS?: string }): string | null {
  const origin = request.headers.get("Origin")
  if (!origin) return null // 同源请求无需 CORS
  const allowed = resolveAllowedOrigins(env)
  return allowed.includes(origin) ? origin : null
}

function buildCorsHeaders(allowedOrigin: string | null): Record<string, string> {
  if (!allowedOrigin) return {}
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  }
}

// 模块级当前请求的 CORS 来源（由 fetch 入口在每次请求时设置）
let currentCorsOrigin: string | null = null

/**
 * 在请求处理开始时调用，记录本次请求允许的 CORS 来源，
 * 供 json() 等无 request 上下文的响应助手使用。
 */
export function setCorsOrigin(request: Request, env?: { ALLOWED_ORIGINS?: string }): void {
  currentCorsOrigin = resolveCorsOrigin(request, env)
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...buildCorsHeaders(currentCorsOrigin),
      ...SECURITY_HEADERS,
    },
  })
}

export function jsonError(code: string, message: string, status = 400): Response {
  const body: ApiErrorBody = { code, message }
  return json({ success: false, error: body }, status)
}

export function unauthorized(message = "未授权"): Response {
  return jsonError("UNAUTHORIZED", message, 401)
}

export function internalError(message = "服务器内部错误"): Response {
  return jsonError("INTERNAL_ERROR", message, 500)
}

export function notFound(message = "资源不存在"): Response {
  return jsonError("NOT_FOUND", message, 404)
}

export function tooManyRequests(message = "请求过于频繁"): Response {
  return jsonError("RATE_LIMITED", message, 429)
}

export function corsOptions(request: Request, env?: { ALLOWED_ORIGINS?: string }): Response {
  const origin = resolveCorsOrigin(request, env)
  return new Response(null, {
    status: 204,
    headers: {
      ...buildCorsHeaders(origin),
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
      ...SECURITY_HEADERS,
    },
  })
}
