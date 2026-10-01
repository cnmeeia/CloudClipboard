/**
 * Access 登录辅助路由。
 *
 * 用途：iOS App 用 ASWebAuthenticationSession 打开
 * `GET /api/auth/done`（该域名受 Cloudflare Access 保护）→
 * 用户在系统浏览器里完成 Access 登录 → Access 把请求放行到 Worker →
 * 本路由 302 跳转到 `cloudclipboard://access-auth` →
 * ASWebAuthenticationSession 捕获自定义 scheme 回调并自动关闭。
 *
 * App 随后从共享 Cookie（CF_Authorization）取出 JWT，
 * 以 `Cf-Access-Jwt-Assertion` 请求头调用 API（见 auth/index.ts）。
 *
 * 注意：本路由在 Worker 内不做鉴权（边缘 Access 已经 gate 过）。
 * 即使用户的 Worker 还没部署这个路由，iOS 端也有兜底：
 * 用户在浏览器里手动点「完成」关闭，App 照样从 Cookie 里读 JWT。
 */

const APP_CALLBACK_SCHEME = "cloudclipboard://access-auth"

/** Access 登录完成 → 跳回 App */
export function handleAuthDone(): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: APP_CALLBACK_SCHEME,
      "Cache-Control": "no-store",
    },
  })
}
