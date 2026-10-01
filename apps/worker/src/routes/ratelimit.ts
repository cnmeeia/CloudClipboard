/**
 * 速率限制（§58）
 *
 * 使用 D1 持久化计数（rate_limits 表），按 IP + 路由维度，
 * 支持多副本/重启后依然有效。分端点阈值由 RATE_LIMITS 配置。
 *
 * 注意：D1 写入有延迟，边缘场景下用宽松窗口（60s）可接受；
 * 严格生产可升级为 Cloudflare Rate Limiting 规则（Workers Paid）。
 */

import type { Env } from "../env"
import { RATE_LIMITS } from "@cloudclipboard/shared"
import { incrementRateLimit } from "../db"

export interface RateLimitResult {
  allowed: boolean
  retryAfterSec?: number
}

export async function checkRateLimit(
  env: Env,
  request: Request,
  routeKey: string
): Promise<RateLimitResult> {
  if (!env.DB) {
    return { allowed: true } // 无 DB 时不限流（本地开发）
  }

  const ip = request.headers.get("CF-Connecting-IP")
    || request.headers.get("x-real-ip")
    || "unknown"

  const config = RATE_LIMITS[routeKey] || RATE_LIMITS.default
  const windowMs = config.windowMs
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs
  const key = `${ip}:${routeKey}:${windowStart}`

  try {
    const count = await incrementRateLimit(env, key, windowStart)
    if (count > config.limit) {
      const retryAfterSec = Math.ceil((windowStart + windowMs - Date.now()) / 1000)
      return { allowed: false, retryAfterSec }
    }
    return { allowed: true }
  } catch {
    // 限流系统自身故障时放行（fail-open），避免影响主流程
    return { allowed: true }
  }
}

/** 根据请求路径推断限流 key */
export function inferRateLimitKey(method: string, path: string): string {
  if (path === "/api/devices/register") return "devices:register"
  if (method === "GET" && path.startsWith("/api/clipboard")) return "clipboard:list"
  if (method === "POST" && path.startsWith("/api/clipboard")) return "clipboard:create"
  if (path.startsWith("/api/files/upload")) return "files:upload"
  if (method === "PUT" && path.startsWith("/api/prefs")) return "prefs:update"
  return "default"
}
