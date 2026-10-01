/**
 * Cloudflare Worker 环境绑定
 */

export interface Env {
  DB: D1Database
  BUCKET: R2Bucket
  /** 版本元数据绑定（见 wrangler.jsonc version_metadata）：读取当前部署 ID/tag/时间戳 */
  CF_VERSION_METADATA?: WorkerVersionMetadata
  /** 允许的 CORS 跨域来源白名单（逗号分隔）。未配置时使用内置默认白名单。 */
  ALLOWED_ORIGINS?: string
  ENCRYPTION_VERSION?: string
  DEFAULT_TTL_MS?: string
  /**
   * 允许的应用 aud（Access Application AUD 标识）。
   * 生产环境强烈建议配置：一旦设置，Worker 会校验 Cf-Access-Jwt-Assertion 的
   * JWT 签名与 aud，防止直接绕过 Access 伪造 CF-Access-Authenticated-User-Email 头。
   */
  CF_ACCESS_AUD?: string
  /**
   * Cloudflare Access 团队域名（如 "your-team"，对应
   * https://your-team.cloudflareaccess.com）。与 CF_ACCESS_AUD 搭配使用，
   * 用于拉取 JWKS 校验 Access JWT 签名。
   */
  CF_ACCESS_TEAM_DOMAIN?: string
  /** 本地/开发兜底邮箱（可选；生产环境由边缘 Zero Trust 注入邮箱头） */
  CF_ACCESS_DEV_EMAIL?: string
  /**
   * 生产强制 JWT 校验开关。设 "true" 时，即使未配置 CF_ACCESS_AUD / CF_ACCESS_TEAM_DOMAIN
   * 也拒绝放行（fail-closed），防止生产环境忘记配置导致洞未补上。
   * 本地开发无需设置。
   */
  FORCE_ACCESS_JWT?: string
}
