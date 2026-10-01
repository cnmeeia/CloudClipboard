/**
 * 当前用户身份（/api/me）
 * 返回稳定 userId，供前端作为 PBKDF2 派生盐的一部分。
 * 注意：仅返回 userId（非敏感、仅用于派生 salt），不返回邮箱或其他隐私数据。
 */

import type { Env } from "../env"
import { requireAuth } from "../auth"
import { json } from "./response"

export async function handleMe(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env)
  return json({
    success: true,
    user: {
      id: auth.userId,
    },
  })
}
