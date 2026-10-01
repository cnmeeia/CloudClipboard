/**
 * 通知路由：仅保留 Bark 测试
 */

import type { Env } from "../env"
import { requireAuth } from "../auth"
import { sendBarkNotification } from "../push/bark"
import { json, jsonError } from "./response"

// POST /api/push/test（Bark 测试）
export async function handlePushTest(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env)

  const body = await request.json().catch(() => null)
  const barkUrl = typeof (body as Record<string, unknown> | null)?.barkUrl === "string"
    ? (body as Record<string, unknown>).barkUrl as string
    : ""

  if (!barkUrl) {
    return jsonError("BARK_URL_REQUIRED", "请提供 Bark URL", 200)
  }

  const bark = await sendBarkNotification(barkUrl, {
    title: "CloudClipboard",
    body: "🎉 Bark 通知工作正常",
    group: "cloudclipboard",
  })
  if (!bark.ok) {
    return jsonError("BARK_SEND_FAILED", bark.error || "Bark 推送失败", 200)
  }
  return json({ success: true, message: "Bark 测试通知已发送" })
}
