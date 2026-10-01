/**
 * Cron 定时清理
 * 每 30 分钟执行：清理过期剪贴板/文件、撤销设备、审计日志、限流窗口
 */

import type { Env } from "./env"

export async function handleScheduled(env: Env): Promise<void> {
  const now = Date.now()

  // 1. 清理过期剪贴板（含 R2 文件）
  const expiredItems = await env.DB.prepare(
    `SELECT id, r2_key FROM clipboard_items WHERE expires_at IS NOT NULL AND expires_at < ?`
  ).bind(now).all<{ id: string; r2_key: string | null }>()

  for (const item of expiredItems.results || []) {
    if (item.r2_key) {
      await env.BUCKET.delete(item.r2_key).catch(() => {})
    }
    await env.DB.prepare(`DELETE FROM clipboard_items WHERE id = ?`).bind(item.id).run()
  }

  // 2. 清理撤销设备（7 天后彻底删除）
  await env.DB.prepare(
    `DELETE FROM devices WHERE revoked_at IS NOT NULL AND revoked_at < ?`
  ).bind(now - 7 * 24 * 60 * 60 * 1000).run()

  // 3. 清理过期审计日志（保留 90 天）
  await env.DB.prepare(
    `DELETE FROM audit_logs WHERE created_at < ?`
  ).bind(now - 90 * 24 * 60 * 60 * 1000).run()

  // 4. 清理旧 rate_limits 窗口（由 incrementRateLimit 顺带处理，这里兜底）
  await env.DB.prepare(
    `DELETE FROM rate_limits WHERE window_start < ?`
  ).bind(now - 10 * 60 * 1000).run()

  console.log(`[cron] cleanup done: ${expiredItems.results?.length || 0} items expired`)
}
