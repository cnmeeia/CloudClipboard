/**
 * Cloudflare Access JWT 身份认证
 *
 * 认证架构：
 * 1. Cloudflare Zero Trust（Access）在边缘完成登录（Passkey / MFA / SSO）
 * 2. 每个到达 Worker 的请求携带 `Cf-Access-Jwt-Assertion` JWT
 * 3. Worker 验证 JWT 签名（JWKS）、issuer、aud，提取 sub / email 身份
 * 4. 按 sub 自动 upsert users 表（D1），确保用户行始终存在
 *
 * 安全策略：
 * - 配置了 CF_ACCESS_AUD + CF_ACCESS_TEAM_DOMAIN 时，只信任 JWT 验证通过的
 *   身份，不再信任裸的 CF-Access-Authenticated-User-Email 头（防止伪造）
 * - 未配置（仅本地开发）时回退到邮箱头
 * - FORCE_ACCESS_JWT=true 时 fail-closed，未配置 JWT 参数直接拒绝
 *
 * 剪贴板内容始终为客户端 AES-256-GCM 端到端加密密文，服务器只保存密文。
 */

import { jwtVerify, createRemoteJWKSet } from "jose"
import type { Env } from "../env"
import { findApiTokenByHash, touchApiToken, upsertUserByAuth } from "../db"

/** Access 在边缘注入的用户邮箱头（仅本地开发 / 未配置 JWT 时使用） */
const EMAIL_HEADER = "CF-Access-Authenticated-User-Email"
/** Access 在边缘注入的 principal 名兜底头 */
const PRINCIPAL_HEADER = "CF-Access-Authenticated-User-Principal-Name"
/** Access 在边缘注入的 JWT（用于校验请求确实经过 Access，而非伪造头） */
const JWT_HEADER = "Cf-Access-Jwt-Assertion"
/** API Token 前缀（明文 token 形如 cca_xxx，用于识别类型） */
export const API_TOKEN_PREFIX = "cca_"

/**
 * JWKS 远程密钥集缓存。createRemoteJWKSet 内部自带缓存 + 去重请求，
 * 跨请求复用同一个 Worker isolate 时不会重复拉取。
 */
let jwksCache: { teamDomain: string; jwks: ReturnType<typeof createRemoteJWKSet> } | null = null

/**
 * 测试注入钩子：允许测试覆盖 JWKS 获取逻辑，
 * 避免 Node 环境下 createRemoteJWKSet 的 https.get 无法 mock。
 * 生产代码不设置此钩子。
 */
let jwksOverride: ((teamDomain: string) => Parameters<typeof jwtVerify>[1]) | null = null

/** @internal 测试专用 */
export function __setJwksOverride(fn: ((teamDomain: string) => Parameters<typeof jwtVerify>[1]) | null): void {
  jwksOverride = fn
  jwksCache = null
}

function getJwks(teamDomain: string) {
  if (jwksOverride) return jwksOverride(teamDomain)
  if (jwksCache && jwksCache.teamDomain === teamDomain) return jwksCache.jwks
  const jwks = createRemoteJWKSet(
    new URL(`https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`)
  )
  jwksCache = { teamDomain, jwks }
  return jwks
}

/**
 * JWT 校验结果：sub（JWT 唯一标识）+ email
 */
interface JwtVerified {
  sub: string
  email: string
}

/**
 * 校验 Cloudflare Access 注入的 JWT（Cf-Access-Jwt-Assertion）。
 *
 * 完整验证链：
 * - JWT 签名（通过 team 的 JWKS 拉取公钥）
 * - issuer（必须是 team.cloudflareaccess.com）
 * - aud（必须是 Access Application 的 AUD Tag）
 * - exp / nbf（由 jose 自动验证）
 *
 * 验证通过后返回 payload 中的 sub 和 email。
 * 验证失败返回 null（由调用方决定拒绝逻辑）。
 */
async function verifyAccessJwt(request: Request, env: Env): Promise<JwtVerified | null> {
  if (!env.CF_ACCESS_AUD || !env.CF_ACCESS_TEAM_DOMAIN) {
    // 未配置校验所需参数：
    // - 若 FORCE_ACCESS_JWT=true（生产强制），直接拒绝（fail-closed）
    // - 否则跳过验证（仅推荐用于本地开发）
    if (env.FORCE_ACCESS_JWT === "true") {
      throw new Error("AUTH_JWT_NOT_CONFIGURED")
    }
    return null
  }

  const token = request.headers.get(JWT_HEADER)
  if (!token) return null

  try {
    const jwks = getJwks(env.CF_ACCESS_TEAM_DOMAIN)
    const { payload } = await jwtVerify(token, jwks, {
      audience: env.CF_ACCESS_AUD,
      issuer: `https://${env.CF_ACCESS_TEAM_DOMAIN}.cloudflareaccess.com`,
    })
    const sub = typeof payload.sub === "string" && payload.sub ? payload.sub : null
    const email = typeof payload.email === "string" && payload.email ? payload.email : null
    if (!sub || !email) return null
    return { sub, email }
  } catch (e) {
    console.error("[auth] Access JWT 校验失败:", e)
    return null
  }
}

/**
 * 认证结果。
 * - access: 通过 Cloudflare Access JWT / 邮箱头认证
 * - api_token: 通过 Authorization: Bearer <api-token> 认证（curl / CLI）
 */
export type AuthMethod = "access" | "api_token"

export interface AccessIdentity {
  /** 稳定用户标识（由 email SHA-256 派生），用于数据归属与隔离 */
  userId: string
  /** JWT sub（Cloudflare Access 用户唯一标识） */
  sub: string
  /** 邮箱 */
  email: string
  /** 显示名 */
  name: string
  /** 应用 aud（可选，透传） */
  aud: string
  /** 认证方式 */
  method: AuthMethod
  /** 当使用 API Token 认证时，对应 token 记录 id（可用于更新 last_used） */
  apiTokenId?: string
}

/**
 * 从 Access 邮箱/标识派生稳定的 userId（SHA-256 前缀）。
 * 同一邮箱始终得到同一 userId，跨设备/跨版本稳定 → 数据不丢失。
 */
export async function identityUserId(email: string): Promise<string> {
  const norm = email.trim().toLowerCase()
  const data = new TextEncoder().encode(norm)
  const digest = await crypto.subtle.digest("SHA-256", data)
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  return `cf_${hex.slice(0, 32)}`
}

/** 计算 token 的 SHA-256 哈希（服务器只存哈希） */
export async function hashApiToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/**
 * 通过 API Token 认证：
 * 从 Authorization: Bearer <token> 解析明文 token，查库（哈希比对）得到归属用户。
 * 返回 null 表示 token 无效/缺失。
 */
async function authenticateWithApiToken(request: Request, env: Env): Promise<AccessIdentity | null> {
  const header = request.headers.get("Authorization") || ""
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  if (!match) return null

  const token = match[1].trim()
  if (!token.startsWith(API_TOKEN_PREFIX)) return null

  const tokenHash = await hashApiToken(token)
  const row = await findApiTokenByHash(env, tokenHash)
  if (!row) return null

  // 异步更新 last_used，不阻塞响应
  touchApiToken(env, row.id).catch(() => {})

  return {
    userId: row.user_id,
    sub: row.user_id,
    email: `api:${row.name}`, // API token 没有邮箱，用 token 名兜底展示
    name: row.name || "api",
    aud: env.CF_ACCESS_AUD || "",
    method: "api_token",
    apiTokenId: row.id,
  }
}

/**
 * 读取当前请求身份。
 *
 * 认证优先级：
 * 1) API Token（Authorization: Bearer cca_...）— curl / CLI 调用
 * 2) Cloudflare Access JWT（Cf-Access-Jwt-Assertion）— 生产推荐
 * 3) Access 邮箱头（未配置 JWT 校验参数时的回退，仅本地开发）
 *
 * 配置了 CF_ACCESS_AUD + CF_ACCESS_TEAM_DOMAIN（或 FORCE_ACCESS_JWT=true）时，
 * 只信任 JWT 验证通过的身份，不再信任裸邮箱头。
 *
 * JWT 验证通过后，自动 upsert users 表（绑定 cf_subject + email），
 * 确保用户记录始终存在。
 */
export async function requireAuth(request: Request, env: Env): Promise<AccessIdentity> {
  // 1) API Token 认证（curl / CLI）
  const apiIdentity = await authenticateWithApiToken(request, env)
  if (apiIdentity) return apiIdentity

  // 2) Access JWT 校验（生产推荐）
  const jwtVerified = await verifyAccessJwt(request, env)

  // 3) Access 邮箱头（仅本地开发回退）
  const headerEmail =
    request.headers.get(EMAIL_HEADER) ||
    request.headers.get(PRINCIPAL_HEADER) ||
    env.CF_ACCESS_DEV_EMAIL

  // 已配置 JWT 校验参数或生产强制 → 必须通过 JWT 验证
  const jwtConfigured = Boolean(env.CF_ACCESS_AUD && env.CF_ACCESS_TEAM_DOMAIN)
  const forceJwt = env.FORCE_ACCESS_JWT === "true"

  let email: string | null
  let cfSubject: string

  if (jwtConfigured || forceJwt) {
    // JWT 模式：sub 和 email 都来自验证通过的 JWT payload
    if (!jwtVerified) {
      throw new Error("AUTH_MISSING_IDENTITY")
    }
    email = jwtVerified.email
    cfSubject = jwtVerified.sub
  } else {
    // 本地开发回退：从邮箱头获取，sub 与 email 相同
    email = headerEmail ?? null
    cfSubject = headerEmail ?? ""
  }

  if (!email) {
    throw new Error("AUTH_MISSING_IDENTITY")
  }

  const userId = await identityUserId(email)
  const identity: AccessIdentity = {
    userId,
    sub: cfSubject || email,
    email,
    name: email,
    aud: env.CF_ACCESS_AUD || "",
    method: "access",
  }

  // 自动创建/更新用户记录（D1 users 表），异步失败不阻塞响应
  if (env.DB) {
    upsertUserByAuth(env, {
      userId,
      cfSubject: identity.sub,
      email,
      now: Date.now(),
    }).catch((e) => {
      console.error("[auth] upsert user failed:", e)
    })
  }

  return identity
}

export function generateUUID(): string {
  return crypto.randomUUID()
}
