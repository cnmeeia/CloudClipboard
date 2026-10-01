/**
 * 健康检查 / Observability（§60）
 * 检查 Worker / D1 / R2 状态
 * 不记录任何用户剪贴板明文。
 */

import type { Env } from "../env"
import { json } from "./response"
import { SERVICE_VERSION } from "@cloudclipboard/shared"

export async function handleHealth(env: Env): Promise<Response> {
  const checks: Record<string, boolean> = {
    worker: true,
    d1: !!env.DB,
    r2: !!env.BUCKET,
  }

  // 实际探测 D1（轻量查询）
  if (env.DB) {
    try {
      await env.DB.prepare("SELECT 1 as ok").first()
      checks.d1 = true
    } catch {
      checks.d1 = false
    }
  }

  const allOk = Object.values(checks).every(Boolean)

  return json({
    success: allOk,
    service: "CloudClipboard",
    version: SERVICE_VERSION,
    // 本次部署的 Cloudflare Worker Version ID（每次 wrangler deploy 变化）
    deployment: env.CF_VERSION_METADATA
      ? {
          id: env.CF_VERSION_METADATA.id,
          tag: env.CF_VERSION_METADATA.tag,
          timestamp: Number(env.CF_VERSION_METADATA.timestamp),
        }
      : null,
    timestamp: Date.now(),
    checks,
  }, allOk ? 200 : 503)
}
