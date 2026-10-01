/**
 * API Token 路由：list / create / revoke
 *
 * 用途：为 curl / CLI / 脚本提供 Bearer Token 认证，方便直接调用 Worker API
 * （尤其是上传剪贴板内容），无需经过 Cloudflare Access 登录流程。
 *
 * 安全：
 * - 服务器只保存 token 的 SHA-256 哈希，明文 token 生成后仅返回一次
 * - Token 前缀 cca_，可设置过期时间，可手动吊销
 */

import type { Env } from "../env"
import { generateUUID, hashApiToken, requireAuth, API_TOKEN_PREFIX } from "../auth"
import { insertApiToken, listApiTokensByUser, revokeApiToken } from "../db"
import { json, jsonError, notFound } from "./response"

/** 生成随机明文 token（含前缀） */
function generateApiToken(): { token: string; tokenId: string } {
  const tokenId = generateUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  return { token: `${API_TOKEN_PREFIX}${hex}`, tokenId }
}

interface ApiTokenView {
  id: string
  name: string
  created_at: number
  last_used_at: number | null
  expires_at: number | null
}

/** 将 DB 行转为安全视图（不暴露哈希与 userId） */
function toTokenView(r: {
  id: string
  name: string
  created_at: number
  last_used_at: number | null
  expires_at: number | null
}): ApiTokenView {
  return {
    id: r.id,
    name: r.name,
    created_at: r.created_at,
    last_used_at: r.last_used_at,
    expires_at: r.expires_at,
  }
}

// GET /api/tokens
export async function handleListTokens(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env)
  const rows = await listApiTokensByUser(env, auth.userId)
  const tokens = rows.map(toTokenView)
  return json({ success: true, tokens, count: tokens.length })
}

// POST /api/tokens  body: { name?, expires_in? }
export async function handleCreateToken(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env)

  const body = (await request.json().catch(() => null)) as {
    name?: string
    expires_in?: number | string
  } | null
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim().slice(0, 64) : "api"
  // 过期秒数（可选，默认永久不过期）
  const expiresIn = typeof body?.expires_in === "number" && body.expires_in > 0 ? body.expires_in : null

  const { token, tokenId } = generateApiToken()
  const tokenHash = await hashApiToken(token)
  const now = Date.now()
  const expiresAt = expiresIn ? now + expiresIn * 1000 : null

  await insertApiToken(env, {
    id: tokenId,
    userId: auth.userId,
    tokenHash,
    name,
    now,
    expiresAt,
  })

  return json(
    {
      success: true,
      token: {
        id: tokenId,
        name,
        created_at: now,
        expires_at: expiresAt,
        // 明文 token 仅此一次返回，之后服务器只存哈希
        api_token: token,
      },
      note: "请立即保存该 token，明文只显示这一次。",
    },
    201
  )
}

// DELETE /api/tokens/:id
export async function handleRevokeToken(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireAuth(request, env)
  const rows = await listApiTokensByUser(env, auth.userId)
  const exists = rows.some((r) => r.id === id)
  if (!exists) return notFound("Token 不存在")

  await revokeApiToken(env, id, auth.userId)
  return json({ success: true })
}
