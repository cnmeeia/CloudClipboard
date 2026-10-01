import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createLocalJWKSet, type JSONWebKeySet } from "jose"
import { createClipboardSchema, updatePrefsSchema, detectPlatformFromUA, RATE_LIMITS } from "@cloudclipboard/shared"
import { inferRateLimitKey } from "../src/routes/ratelimit"
import { sanitizeFilename } from "../src/routes/files"
import { identityUserId, hashApiToken, API_TOKEN_PREFIX, requireAuth, __setJwksOverride } from "../src/auth"
import { resolveCorsOrigin, resolveAllowedOrigins, internalError, jsonError } from "../src/routes/response"
import { handleClipboardCreate } from "../src/routes/clipboard"
import { handleGetPrefs, handleUpdatePrefs } from "../src/routes/prefs"
import { listApiTokensByUser } from "../src/db"
import type { Env } from "../src/env"

// Node 24 原生自带 Web Crypto（只读 getter），无需注入

describe("Zod Schema 校验（§64）", () => {
  it("clipboard create：合法输入通过", () => {
    const result = createClipboardSchema.safeParse({
      type: "text",
      encrypted_data: "abc123",
      iv: "iv123",
      salt: "salt",
      wrapped_key: "wk",
      expires_in: 604800000,
    })
    expect(result.success).toBe(true)
  })

  it("clipboard create：缺少加密数据失败", () => {
    const result = createClipboardSchema.safeParse({ type: "text" })
    expect(result.success).toBe(false)
  })

  it("prefs：合法主题（system/light/dark）通过", () => {
    for (const theme of ["system", "light", "dark"] as const) {
      expect(updatePrefsSchema.safeParse({ theme }).success).toBe(true)
    }
  })

  it("prefs：非法主题失败", () => {
    expect(updatePrefsSchema.safeParse({ theme: "blue" }).success).toBe(false)
  })

  it("prefs：支持只更新通知偏好（部分更新）", () => {
    expect(updatePrefsSchema.safeParse({ notification: { new_clipboard: false } }).success).toBe(true)
  })

  it("prefs：空对象失败（无任何字段的更新应属误调用）", () => {
    expect(updatePrefsSchema.safeParse({}).success).toBe(false)
  })
})

describe("平台检测", () => {
  it("iPhone UA → ios", () => {
    expect(detectPlatformFromUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe("ios")
  })
  it("Mac UA → mac", () => {
    expect(detectPlatformFromUA("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe("mac")
  })
  it("空 UA → web", () => {
    expect(detectPlatformFromUA("")).toBe("web")
  })
})

describe("Rate Limit key 推断（§58）", () => {
  it("devices/register → devices:register", () => {
    expect(inferRateLimitKey("POST", "/api/devices/register")).toBe("devices:register")
  })
  it("clipboard GET → clipboard:list", () => {
    expect(inferRateLimitKey("GET", "/api/clipboard")).toBe("clipboard:list")
  })
  it("Rate limit 配置存在", () => {
    expect(RATE_LIMITS["devices:register"].limit).toBe(10)
    expect(RATE_LIMITS["clipboard:create"].limit).toBe(120)
  })
  it("prefs PUT → prefs:update", () => {
    expect(inferRateLimitKey("PUT", "/api/prefs")).toBe("prefs:update")
    expect(RATE_LIMITS["prefs:update"].limit).toBe(30)
  })
})

describe("安全修复：文件名路径遍历（sanitizeFilename）", () => {
  it("去除路径分隔符", () => {
    expect(sanitizeFilename("a/../../etc/passwd")).not.toContain("/")
    expect(sanitizeFilename("..\\..\\evil")).not.toContain("\\")
  })
  it("去除 .. 片段", () => {
    const out = sanitizeFilename("..\\..\\evil.txt")
    expect(out).not.toContain("..")
  })
  it("空输入回退到默认名", () => {
    expect(sanitizeFilename("...")).toBeTruthy()
    expect(sanitizeFilename("")).toBe("encrypted.bin")
  })
  it("截断到 255 字符", () => {
    expect(sanitizeFilename("a".repeat(500)).length).toBeLessThanOrEqual(255)
  })
})

describe("安全修复：CORS 白名单（resolveCorsOrigin / resolveAllowedOrigins）", () => {
  it("同源请求（无 Origin 头）不返回 CORS 来源", () => {
    const req = new Request("https://clip.0272.de5.net/api/health")
    expect(resolveCorsOrigin(req)).toBe(null)
  })
  it("白名单内来源通过", () => {
    const req = new Request("https://clip.0272.de5.net/api/health", {
      headers: { Origin: "https://clip.0272.de5.net" },
    })
    expect(resolveCorsOrigin(req)).toBe("https://clip.0272.de5.net")
  })
  it("白名单外来源被拒绝", () => {
    const req = new Request("https://clip.0272.de5.net/api/health", {
      headers: { Origin: "https://evil.example.com" },
    })
    expect(resolveCorsOrigin(req)).toBe(null)
  })
  it("env.ALLOWED_ORIGINS 覆盖默认白名单", () => {
    expect(resolveAllowedOrigins({ ALLOWED_ORIGINS: "https://a.com,https://b.com" })).toEqual(["https://a.com", "https://b.com"])
  })
})

describe("CF Access 稳定用户身份（数据保留）", () => {
  it("同一邮箱 → 同一 userId（跨设备/版本稳定）", async () => {
    const a = await identityUserId("User@Example.com")
    const b = await identityUserId("user@example.com") // 规范化
    expect(a).toBe(b)
    expect(a.startsWith("cf_")).toBe(true)
  })
  it("不同邮箱 → 不同 userId", async () => {
    const a = await identityUserId("alice@example.com")
    const b = await identityUserId("bob@example.com")
    expect(a).not.toBe(b)
  })
})

describe("API Token 哈希（curl / CLI 认证）", () => {
  it("Token 带前缀 cca_", () => {
    expect(API_TOKEN_PREFIX).toBe("cca_")
  })
  it("同一 token → 同一哈希（64 位 hex），服务器只存哈希", async () => {
    const token = `${API_TOKEN_PREFIX}abc123`
    const h1 = await hashApiToken(token)
    const h2 = await hashApiToken(token)
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
    expect(h1).not.toContain(token) // 哈希不回显明文
  })
  it("不同 token → 不同哈希", async () => {
    const a = await hashApiToken(`${API_TOKEN_PREFIX}aaa`)
    const b = await hashApiToken(`${API_TOKEN_PREFIX}bbb`)
    expect(a).not.toBe(b)
  })
})

describe("API Token 列表过滤已吊销（软删除）", () => {
  it("listApiTokensByUser 的 SQL 过滤 revoked_at IS NULL", async () => {
    let sql = ""
    const mockDB = {
      prepare: (q: string) => {
        sql = q
        return {
          bind: () => ({
            all: async () => ({ results: [] }),
          }),
        }
      },
    }
    await listApiTokensByUser({ DB: mockDB } as never, "cf_user")
    expect(sql).toContain("revoked_at IS NULL")
    expect(sql).toContain("WHERE user_id = ?")
  })

  it("已吊销 token 不出现在返回列表中（模拟 D1 过滤）", async () => {
    const mockDB = {
      prepare: () => ({
        bind: () => ({
          all: async () => ({
            // 模拟数据库仅返回未吊销的行
            results: [
              { id: "active", user_id: "cf_user", name: "api", token_hash: "h", created_at: 1, last_used_at: null, expires_at: null, revoked_at: null },
            ],
          }),
        }),
      }),
    }
    const rows = await listApiTokensByUser({ DB: mockDB } as never, "cf_user")
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe("active")
    expect(rows.every((r) => r.revoked_at === null)).toBe(true)
  })
})

// ──────────────────────────────
// 用户偏好路由（主题跨设备同步）
// 使用本地开发模式（未配置 JWT 参数）走 CF-Access-Authenticated-User-Email 头
// ──────────────────────────────

describe("用户偏好：主题跨设备同步（/api/prefs）", () => {
  /** 构造 mock DB：SELECT 返回给定 theme，INSERT 成功 */
  function makePrefsEnv(theme: string | null | undefined) {
    const mockDB = {
      prepare: () => ({
        bind: () => ({
          first: async () => (theme == null ? undefined : { theme }),
          run: async () => ({}),
        }),
      }),
    }
    return { DB: mockDB } as unknown as Env
  }


  function prefsRequest(method: string, body?: unknown): Request {
    const headers: Record<string, string> = {
      "CF-Access-Authenticated-User-Email": "alice@example.com",
    }
    const init: RequestInit = { method, headers }
    if (body !== undefined) {
      headers["Content-Type"] = "application/json"
      init.body = JSON.stringify(body)
    }
    return new Request("https://clip.example.com/api/prefs", init)
  }

  it("GET：返回云端已保存的主题", async () => {
    const res = await handleGetPrefs(prefsRequest("GET"), makePrefsEnv("dark"))
    expect(res.status).toBe(200)
    const data = (await res.json()) as { prefs: { theme: string } }
    expect(data.prefs.theme).toBe("dark")
  })

  it("GET：无记录 / theme 为空时回退 system", async () => {
    const res = await handleGetPrefs(prefsRequest("GET"), makePrefsEnv(null))
    const data = (await res.json()) as { prefs: { theme: string } }
    expect(data.prefs.theme).toBe("system")
  })

  /**
   * 「内存库」mock：按 SQLite 语义解释写入语句——
   * 首次 INSERT 按列顺序落值；命中 `ON CONFLICT(id) DO UPDATE SET`
   * 时只覆盖该语句显式列出的列，其余列保持原值（这正是被忽略的关键语义）。
   * 用于回归「只更新通知偏好却把主题重置为 system」的线上问题。
   */
  function makeStatefulEnv() {
    const state: Record<string, unknown> = { theme: "dark", theme_set: 1, notif_new_clipboard: 1 }
    const calls: string[] = []

    /** 解析 INSERT 列名 → 参数下标 */
    const insertColumns = (sql: string): string[] =>
      /INSERT\s+INTO\s+users\s*\(([^)]*)\)/i.exec(sql)?.[1]?.split(",").map((c) => c.trim()) ?? []

    const applyWrite = (sql: string, params: unknown[]) => {
      calls.push(sql)

      // 1) 纯 UPDATE（如通知偏好）：只覆盖 SET 列出的列
      const updateSet = /UPDATE\s+users\s+SET\s+([\s\S]*?)\s+WHERE/i.exec(sql)
      if (!/INSERT\s+INTO\s+users/i.test(sql) && updateSet) {
        const setCols = updateSet[1].split(",").map((p) => p.split("=")[0].trim())
        setCols.forEach((col, i) => {
          state[col] = params[i] ?? 0
        })
        return
      }

      const cols = insertColumns(sql)
      const valueOf = (col: string): unknown => {
        const idx = cols.indexOf(col)
        return idx >= 0 ? params[idx] : undefined // 不在列清单中 → SQLite 取列默认值
      }

      // 2) UPSERT：SQLite 会用 excluded.<col> 覆盖 SET 中列出的列；
      //    excluded.<col> 在未显式传参时取列默认值（theme 默认 'system'）
      const conflict = /ON\s+CONFLICT\s*\(id\)\s*DO\s+UPDATE\s+SET([\s\S]*)/i.exec(sql)
      if (conflict) {
        const sets = [...conflict[1].matchAll(/([a-z_][a-z0-9_]*)\s*=\s*excluded\.([a-z_][a-z0-9_]*)/gi)]
        for (const [, col, source] of sets) {
          if (col !== source) continue // 只处理 `col = excluded.col` 形式
          const v = valueOf(col)
          state[col] = v === undefined ? (col === "theme" ? "system" : 0) : v
        }
        return
      }

      // 3) 首次 INSERT：按列顺序落值
      cols.forEach((col, i) => {
        state[col] = params[i]
      })
    }

    const mockDB = {
      prepare: (sql: string) => ({
        bind: (...params: unknown[]) => ({
          first: async () => {
            calls.push(sql)
            // WHERE 过滤（简化）：theme_set = 1 且用户从未设置 → 无行
            if (/theme_set\s*=\s*1/.test(sql) && !state.theme_set) return undefined
            return { ...state }
          },
          run: async () => {
            applyWrite(sql, params)
            return {}
          },
        }),
      }),
    }
    const env = { DB: mockDB } as unknown as Env
    return { env, state, calls }
  }

  it("PUT：合法主题保存成功并回显", async () => {
    const { env, state } = makeStatefulEnv()
    const res = await handleUpdatePrefs(prefsRequest("PUT", { theme: "light" }), env)
    expect(res.status).toBe(200)
    expect(state.theme).toBe("light")
    const data = (await res.json()) as { prefs: { theme: string } }
    expect(data.prefs.theme).toBe("light")
  })

  it("回归：只更新通知偏好不会重置已设置的主题", async () => {
    const { env, state } = makeStatefulEnv()
    const res = await handleUpdatePrefs(
      prefsRequest("PUT", { notification: { new_clipboard: false } }),
      env
    )
    expect(res.status).toBe(200)
    expect(state.theme).toBe("dark")
    expect(state.notif_new_clipboard).toBe(0)
    const data = (await res.json()) as { prefs: { theme: string } }
    expect(data.prefs.theme).toBe("dark")
  })

  it("PUT：非法主题 → VALIDATION_ERROR", async () => {
    const res = await handleUpdatePrefs(prefsRequest("PUT", { theme: "blue" }), makePrefsEnv(null))
    expect(res.status).toBe(400)
    const data = (await res.json()) as { error: { code: string } }
    expect(data.error.code).toBe("VALIDATION_ERROR")
  })

  it("PUT：空对象 → VALIDATION_ERROR（避免无意义的全量空更新）", async () => {
    const res = await handleUpdatePrefs(prefsRequest("PUT", {}), makePrefsEnv(null))
    expect(res.status).toBe(400)
  })

  it("PUT：主题写入语句包含 theme_set，且不写 notif_* 列", async () => {
    const { env, calls } = makeStatefulEnv()
    const res = await handleUpdatePrefs(prefsRequest("PUT", { theme: "light" }), env)
    expect(res.status).toBe(200)
    const writes = calls.filter((sql) => /INSERT\s+INTO\s+users/i.test(sql))
    expect(writes.length).toBeGreaterThan(0)
    expect(writes.some((sql) => /theme_set/.test(sql))).toBe(true)
    expect(writes.every((sql) => !/notif_/.test(sql))).toBe(true)
  })

  it("PUT：只更新通知偏好时，所有写入语句都不出现 theme 列（旧实现的重置源头）", async () => {
    const { env, calls } = makeStatefulEnv()
    const res = await handleUpdatePrefs(
      prefsRequest("PUT", { notification: { new_clipboard: false } }),
      env
    )
    expect(res.status).toBe(200)
    const writes = calls.filter((sql) => /(INSERT\s+INTO|UPDATE)\s+users/i.test(sql))
    expect(writes.length).toBeGreaterThan(0)
    expect(writes.some((sql) => /notif_new_clipboard/.test(sql))).toBe(true)
    expect(writes.every((sql) => !/\btheme\b/i.test(sql))).toBe(true)
  })
})

describe("统一错误响应（HTTP 500 必须为合法 JSON）", () => {  it("internalError 返回 500 状态码", () => {
    const res = internalError()
    expect(res.status).toBe(500)
    expect(res.headers.get("Content-Type") || "").toContain("application/json")
  })

  it("internalError body 是可解析的合法 JSON", async () => {
    const res = internalError()
    const body = await res.json()
    expect(body).toEqual({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "服务器内部错误" },
    })
  })

  it("internalError 支持自定义 message", async () => {
    const res = internalError("数据库连接失败")
    const body = (await res.json()) as { error: { message: string } }
    expect(body.error.message).toBe("数据库连接失败")
  })

  it("jsonError 生成的 500 响应 Content-Type 为 JSON", async () => {
    const res = jsonError("INTERNAL_ERROR", "测试错误", 500)
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("INTERNAL_ERROR")
  })
})

// ──────────────────────────────
// Access JWT 校验回归测试（安全修复）
// 验证：配置了 CF_ACCESS_AUD + CF_ACCESS_TEAM_DOMAIN 后，Worker 只信任通过 JWT
// 签名/aud/exp 校验的邮箱身份，不再信任裸的 CF-Access-Authenticated-User-Email 头。
// ──────────────────────────────

describe("Access JWT 校验（安全修复）", () => {
  const TEAM = "test-team"
  const AUD = "test-aud-123"
  let keyPair: { publicKey: CryptoKey; privateKey: CryptoKey }
  let localSet: ReturnType<typeof createLocalJWKSet>

  beforeAll(async () => {
    // 生成测试 RSA 密钥对
    keyPair = await joseGenerateKeyPair()
    // 导出公钥为 JWK 并组成 JWKS，用 createLocalJWKSet 构造本地密钥集
    const publicJwk = await joseExportJWK(keyPair.publicKey)
    const jwks = {
      keys: [{ ...publicJwk, kid: "test-kid", alg: "RS256", use: "sig" }],
    } as JSONWebKeySet
    localSet = createLocalJWKSet(jwks)
    // 注入测试用的 JWKS（避免 Node 下 createRemoteJWKSet 的 https.get 无法 mock）
    __setJwksOverride(() => localSet)
  })

  afterAll(() => {
    // 清除注入，恢复默认逻辑
    __setJwksOverride(null)
  })

  function makeEnv(overrides: Record<string, string | undefined> = {}): Env {
    return {
      DB: {} as never,
      BUCKET: {} as never,
      CF_ACCESS_AUD: AUD,
      CF_ACCESS_TEAM_DOMAIN: TEAM,
      ...overrides,
    }
  }

  async function makeJwt(
    payload: Record<string, unknown> = {},
    opts: { signKey?: CryptoKey; audience?: string; issuer?: string } = {}
  ): Promise<string> {
    const { SignJWT } = await import("jose")
    const now = Math.floor(Date.now() / 1000)
    return new SignJWT({ email: "alice@example.com", sub: "alice@example.com", ...payload })
      .setProtectedHeader({ alg: "RS256", kid: "test-kid" })
      .setIssuedAt(now - 60)
      .setIssuer(opts.issuer ?? `https://${TEAM}.cloudflareaccess.com`)
      .setAudience(opts.audience ?? AUD)
      .setExpirationTime(now + 300)
      .setNotBefore(now - 60)
      .sign(opts.signKey ?? keyPair.privateKey)
  }

  it("配置了 JWT 校验参数：伪造 CF-Access-Authenticated-User-Email 头 → 401（AUTH_MISSING_IDENTITY）", async () => {
    const req = new Request("https://clip.example.com/api/clipboard", {
      headers: { "CF-Access-Authenticated-User-Email": "victim@example.com" },
    })
    await expect(requireAuth(req, makeEnv())).rejects.toThrow("AUTH_MISSING_IDENTITY")
  })

  it("配置了 JWT 校验参数：没有 JWT → 401（AUTH_MISSING_IDENTITY）", async () => {
    const req = new Request("https://clip.example.com/api/clipboard")
    await expect(requireAuth(req, makeEnv())).rejects.toThrow("AUTH_MISSING_IDENTITY")
  })

  it("配置了 JWT 校验参数：正常 Access JWT → 通过并返回正确 userId", async () => {
    const token = await makeJwt()
    const req = new Request("https://clip.example.com/api/clipboard", {
      headers: { "Cf-Access-Jwt-Assertion": token },
    })
    const identity = await requireAuth(req, makeEnv())
    expect(identity.email).toBe("alice@example.com")
    expect(identity.sub).toBe("alice@example.com")
    expect(identity.method).toBe("access")
  })

  it("配置了 JWT 校验参数：JWT aud 错误 → 401（AUTH_MISSING_IDENTITY）", async () => {
    const token = await makeJwt({}, { audience: "wrong-aud" })
    const req = new Request("https://clip.example.com/api/clipboard", {
      headers: { "Cf-Access-Jwt-Assertion": token },
    })
    await expect(requireAuth(req, makeEnv())).rejects.toThrow("AUTH_MISSING_IDENTITY")
  })

  it("配置了 JWT 校验参数：JWT iss 错误 → 401（AUTH_MISSING_IDENTITY）", async () => {
    const token = await makeJwt({}, { issuer: "https://evil.cloudflareaccess.com" })
    const req = new Request("https://clip.example.com/api/clipboard", {
      headers: { "Cf-Access-Jwt-Assertion": token },
    })
    await expect(requireAuth(req, makeEnv())).rejects.toThrow("AUTH_MISSING_IDENTITY")
  })

  it("配置了 JWT 校验参数：JWT 签名错误 → 401（AUTH_MISSING_IDENTITY）", async () => {
    // 用另一把私钥签名（不属于该 team 的 JWKS）
    const otherPair = await joseGenerateKeyPair()
    const token = await makeJwt({}, { signKey: otherPair.privateKey })
    const req = new Request("https://clip.example.com/api/clipboard", {
      headers: { "Cf-Access-Jwt-Assertion": token },
    })
    await expect(requireAuth(req, makeEnv())).rejects.toThrow("AUTH_MISSING_IDENTITY")
  })

  it("配置了 JWT 校验参数：JWT 已过期 → 401（AUTH_MISSING_IDENTITY）", async () => {
    const { SignJWT } = await import("jose")
    const now = Math.floor(Date.now() / 1000)
    const expired = await new SignJWT({ email: "alice@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "test-kid" })
      .setIssuedAt(now - 7200)
      .setIssuer(`https://${TEAM}.cloudflareaccess.com`)
      .setAudience(AUD)
      .setExpirationTime(now - 3600) // 已过期
      .sign(keyPair.privateKey)
    const req = new Request("https://clip.example.com/api/clipboard", {
      headers: { "Cf-Access-Jwt-Assertion": expired },
    })
    await expect(requireAuth(req, makeEnv())).rejects.toThrow("AUTH_MISSING_IDENTITY")
  })

  it("FORCE_ACCESS_JWT=true 但未配置 JWT 参数 → 直接拒绝（AUTH_JWT_NOT_CONFIGURED）", async () => {
    const env = makeEnv({
      CF_ACCESS_AUD: undefined,
      CF_ACCESS_TEAM_DOMAIN: undefined,
      FORCE_ACCESS_JWT: "true",
    })
    const req = new Request("https://clip.example.com/api/clipboard", {
      headers: { "CF-Access-Authenticated-User-Email": "anyone@example.com" },
    })
    await expect(requireAuth(req, env)).rejects.toThrow("AUTH_JWT_NOT_CONFIGURED")
  })

  it("未配置 JWT 参数（本地开发）：裸邮箱头可用（向后兼容）", async () => {
    const env = makeEnv({ CF_ACCESS_AUD: undefined, CF_ACCESS_TEAM_DOMAIN: undefined })
    const req = new Request("https://clip.example.com/api/clipboard", {
      headers: { "CF-Access-Authenticated-User-Email": "alice@example.com" },
    })
    const identity = await requireAuth(req, env)
    expect(identity.email).toBe("alice@example.com")
    expect(identity.userId.startsWith("cf_")).toBe(true)
  })
})

async function joseGenerateKeyPair(): Promise<{ publicKey: CryptoKey; privateKey: CryptoKey }> {
  const { generateKeyPair } = await import("jose")
  return generateKeyPair("RS256")
}

async function joseExportJWK(key: CryptoKey): Promise<Record<string, unknown>> {
  const { exportJWK } = await import("jose")
  return (await exportJWK(key)) as unknown as Record<string, unknown>
}


// ──────────────────────────────
// JWT sub 身份绑定（Security v2）
// 验证：JWT 的 sub 作为用户唯一标识，email 用于展示；cf_subject 自动绑定到 users 表
// ──────────────────────────────

describe("JWT sub 身份绑定（Security v2）", () => {
  const TEAM = "test-team"
  const AUD = "test-aud-123"
  let keyPair: { publicKey: CryptoKey; privateKey: CryptoKey }
  let localSet: ReturnType<typeof createLocalJWKSet>

  beforeAll(async () => {
    keyPair = await joseGenerateKeyPair()
    const publicJwk = await joseExportJWK(keyPair.publicKey)
    const jwks = {
      keys: [{ ...publicJwk, kid: "test-kid", alg: "RS256", use: "sig" }],
    } as JSONWebKeySet
    localSet = createLocalJWKSet(jwks)
    __setJwksOverride(() => localSet)
  })

  afterAll(() => {
    __setJwksOverride(null)
  })

  function makeEnv(overrides: Record<string, string | undefined> = {}): Env {
    const mockDB = {
      prepare: () => ({
        bind: () => ({
          run: async () => ({ success: true }),
        }),
      }),
    }
    return {
      DB: mockDB as never,
      BUCKET: {} as never,
      CF_ACCESS_AUD: AUD,
      CF_ACCESS_TEAM_DOMAIN: TEAM,
      ...overrides,
    }
  }

  async function makeJwt(payload: Record<string, unknown> = {}): Promise<string> {
    const { SignJWT } = await import("jose")
    const now = Math.floor(Date.now() / 1000)
    return new SignJWT({ email: "alice@example.com", sub: "cf-user-abc123", ...payload })
      .setProtectedHeader({ alg: "RS256", kid: "test-kid" })
      .setIssuedAt(now - 60)
      .setIssuer(`https://${TEAM}.cloudflareaccess.com`)
      .setAudience(AUD)
      .setExpirationTime(now + 300)
      .setNotBefore(now - 60)
      .sign(keyPair.privateKey)
  }

  it("JWT sub 与 email 不同时，identity.sub 使用 JWT sub", async () => {
    const token = await makeJwt()
    const req = new Request("https://clip.example.com/api/clipboard", {
      headers: { "Cf-Access-Jwt-Assertion": token },
    })
    const identity = await requireAuth(req, makeEnv())
    expect(identity.sub).toBe("cf-user-abc123")
    expect(identity.email).toBe("alice@example.com")
    expect(identity.userId).not.toBe(identity.sub) // userId 由 email 派生（向后兼容）
    expect(identity.userId.startsWith("cf_")).toBe(true)
  })

  it("JWT 缺少 sub claim → 401（AUTH_MISSING_IDENTITY）", async () => {
    const token = await makeJwt({ sub: undefined })
    const req = new Request("https://clip.example.com/api/clipboard", {
      headers: { "Cf-Access-Jwt-Assertion": token },
    })
    await expect(requireAuth(req, makeEnv())).rejects.toThrow("AUTH_MISSING_IDENTITY")
  })

  it("自动 upsert users 表：requireAuth 后 users 表收到 cf_subject 写入", async () => {
    let capturedSql = ""
    let capturedParams: unknown[] = []
    const mockDB = {
      prepare: (sql: string) => {
        capturedSql = sql
        return {
          bind: (...params: unknown[]) => {
            capturedParams = params
            return { run: async () => ({ success: true }) }
          },
        }
      },
    }
    const env = {
      DB: mockDB as never,
      BUCKET: {} as never,
      CF_ACCESS_AUD: AUD,
      CF_ACCESS_TEAM_DOMAIN: TEAM,
    }
    const token = await makeJwt()
    const req = new Request("https://clip.example.com/api/clipboard", {
      headers: { "Cf-Access-Jwt-Assertion": token },
    })
    const identity = await requireAuth(req, env as unknown as Env)
    // 等待 fire-and-forget 的 upsert 完成
    await new Promise((r) => setTimeout(r, 10))
    expect(capturedSql).toContain("INSERT INTO users")
    expect(capturedSql).toContain("cf_subject")
    expect(capturedParams).toContain(identity.sub)
    expect(capturedParams).toContain("alice@example.com")
  })
})

/**
 * 回归测试：Issue #86「双重粘贴直接两次」（列表里出现两条一模一样的记录）
 *
 * 根因：POST /api/clipboard 每次请求都无条件 INSERT 一条新记录。
 * 客户端重试 / 连按两次同步 / ⌘↵ 连按两下时，服务端会真的落库两条一样的密文，
 * 列表里就出现两张内容完全相同的卡片。
 *
 * 修复：同一设备 60s 内提交**逐字节相同的密文+IV** 视为同一次上传的重放，
 * 直接复用已有记录返回（deduplicated: true），不再插入第二条。
 * 因为 AES-256-GCM 每次加密结果都不同，用户有意重复同步同一内容不会被误拦。
 */
describe("剪贴板创建幂等（Issue #86 回归）", () => {
  type Row = Record<string, unknown>

  /** 极简 D1 stub：只实现本用例需要的 prepare/bind/first/run/all */
  function makeD1Stub() {
    const rows: Row[] = []
    let lastSql = ""
    let lastBinds: unknown[] = []

    const statement = () => ({
      bind(...binds: unknown[]) {
        lastBinds = binds
        return this
      },
      async first<T>(): Promise<T | null> {
        // findRecentDuplicateByCiphertext：用密文+IV+时间窗口找重放
        if (lastSql.includes("SELECT id FROM clipboard_items")) {
          const [userId, deviceId, encryptedData, iv, , since] = lastBinds as [
            string, string, string, string | null, string | null, number
          ]
          const hit = [...rows].reverse().find(
            (r) =>
              r.user_id === userId &&
              r.device_id === deviceId &&
              r.encrypted_data === encryptedData &&
              (r.iv ?? null) === (iv ?? null) &&
              (r.created_at as number) >= since
          )
          return (hit ? ({ id: hit.id } as T) : null)
        }
        // getClipboardItem：按 id 取整条
        if (lastSql.includes("FROM clipboard_items ci")) {
          const [id] = lastBinds as [string]
          const hit = rows.find((r) => r.id === id)
          if (!hit) return null
          return { ...hit, device_name: "iPhone" } as T
        }
        // touchDeviceByUser / upsertUserByAuth / prefs / audit 等一律当作成功
        return null
      },
      async run() {
        if (lastSql.includes("INSERT INTO clipboard_items")) {
          const [id, user_id, device_id, type, encrypted_data, iv, salt, wrapped_key, r2_key, size, mime_type, filename, created_at, expires_at, plain] = lastBinds
          rows.push({ id, user_id, device_id, type, encrypted_data, iv, salt, wrapped_key, r2_key, size, mime_type, filename, created_at, expires_at, plain })
        }
        return { success: true }
      },
      async all() {
        return { results: [] }
      },
    })

    return {
      rows,
      prepare(sql: string) {
        lastSql = sql
        lastBinds = []
        return statement() as never
      },
    }
  }

  function makeEnv(db: unknown): Env {
    return { DB: db as never, BUCKET: {} as never } as Env
  }

  async function post(env: Env, body: Row) {
    const req = new Request("https://clip.example.com/api/clipboard", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-device-id": "iphone-1",
        "x-device-name": "iPhone",
        "CF-Access-Authenticated-User-Email": "alice@example.com",
      },
      body: JSON.stringify(body),
    })
    return handleClipboardCreate(req, env)
  }

  const payload = {
    type: "text",
    encrypted_data: "CIPHERTEXT-32-BYTE-HASH-SAME-BYTES",
    iv: "iv-same",
    salt: "salt",
    wrapped_key: "wk",
    expires_in: null,
  }

  it("同一密文重复提交两次 → 只落库一条，第二次返回 deduplicated", async () => {
    const db = makeD1Stub()
    const env = makeEnv(db)

    const first = await post(env, payload)
    const firstBody = (await first.json()) as { success: boolean; item: { id: string } }
    expect(first.status).toBe(201)
    expect(db.rows).toHaveLength(1)

    const second = await post(env, payload)
    const secondBody = (await second.json()) as { success: boolean; deduplicated?: boolean; item: { id: string } }
    expect(secondBody.success).toBe(true)
    expect(secondBody.deduplicated).toBe(true)
    // 关键断言：库里没有多出第二条
    expect(db.rows).toHaveLength(1)
    // 第二次返回的是同一条记录（客户端可安全原地替换，不会多出一张卡片）
    expect(secondBody.item.id).toBe(firstBody.item.id)
  })

  it("密文不同（用户有意重复同步同一内容）→ 正常落库两条，不被误拦", async () => {
    const db = makeD1Stub()
    const env = makeEnv(db)

    await post(env, payload)
    // AES-256-GCM 每次加密随机 IV，同样的明文密文必然不同
    const other = await post(env, { ...payload, encrypted_data: "ANOTHER-CIPHERTEXT", iv: "iv-2" })
    const otherBody = (await other.json()) as { item: { id: string }; deduplicated?: boolean }
    expect(db.rows).toHaveLength(2)
    expect(otherBody.deduplicated).toBeUndefined()
  })

  it("内容合法但为空的加密数据 → 仍然被 Schema 拒绝（幂等逻辑不放宽校验）", async () => {
    const db = makeD1Stub()
    const env = makeEnv(db)
    const res = await post(env, { ...payload, encrypted_data: "" })
    expect(res.status).toBe(400)
    expect(db.rows).toHaveLength(0)
  })
})
