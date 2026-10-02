/**
 * Access 登录辅助路由。
 *
 * 用途：iOS App 用 ASWebAuthenticationSession 打开
 * `GET /api/auth/done`（该域名受 Cloudflare Access 保护）→
 * 用户在系统浏览器里完成 Access 登录 → Access 把请求放行到 Worker，
 * 并在请求头带上 `Cf-Access-Jwt-Assertion`（Access JWT，与
 * CF_Authorization cookie 同值）→
 * 本路由 302 跳转到 `cloudclipboard://access-auth#token=<JWT>` →
 * ASWebAuthenticationSession 捕获自定义 scheme 回调并自动关闭，
 * App 从 fragment 解析出 JWT（见 AccessLoginService.swift）。
 *
 * token 放在 fragment 里：只在浏览器本地处理，不会发给服务器、
 * 不会出现在服务器日志或 Referer 中。
 *
 * 注意：本路由在 Worker 内不做鉴权（边缘 Access 已经 gate 过）。
 * App 无法读取 ASWebAuthenticationSession 里的 CF_Authorization cookie，
 * 因此回调 URL 是 JWT 的唯一可靠通道，拿不到头时只能跳裸 scheme（由 App 报错）。
 */

const APP_CALLBACK_SCHEME = "cloudclipboard://access-auth"
const JWT_HEADER = "Cf-Access-Jwt-Assertion"

/** Access 登录完成 → 携带 JWT 跳回 App */
export function handleAuthDone(request: Request): Response {
  const jwt = request.headers.get(JWT_HEADER)
  const location = jwt
    ? `${APP_CALLBACK_SCHEME}#token=${encodeURIComponent(jwt)}`
    : APP_CALLBACK_SCHEME
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
    },
  })
}
