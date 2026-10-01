/**
 * 文件路由：R2 上传 / 读取
 *
 * 安全模型：文件在客户端先加密（E2EE），服务器只保存密文。
 * 上传接口接收二进制密文（application/octet-stream），
 * 不执行任何解密逻辑。
 */

import type { Env } from "../env"
import { MAX_FILE_SIZE } from "@cloudclipboard/shared"
import { generateUUID, requireAuth } from "../auth"
import { json, jsonError, notFound, resolveCorsOrigin } from "./response"

/**
 * 清理用户提供的文件名，防止路径遍历 / key 注入。
 * - 去除路径分隔符（/ \\）与控制字符
 * - 去除 ".." 片段
 * - 截断到 255 字符
 */
export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[\\/\x00-\x1f]/g, "_")   // 去掉路径分隔符和控制字符
    .replace(/\.\./g, "_")              // 防路径遍历
    .replace(/^\.+$/, "_")              // 防纯点号
    .trim()
  return (cleaned || "encrypted.bin").slice(0, 255)
}

// POST /api/files/upload - 上传已加密文件（multipart/form-data 或 raw body）
export async function handleFileUpload(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env)

  const contentType = request.headers.get("content-type") || ""

  let bytes: Uint8Array
  let filename = "encrypted.bin"
  let mimeType = "application/octet-stream"

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData()
    const file = formData.get("file")
    if (!(file instanceof File)) {
      return jsonError("VALIDATION_ERROR", "缺少文件")
    }
    bytes = new Uint8Array(await file.arrayBuffer())
    filename = sanitizeFilename(file.name || filename)
    mimeType = file.type || mimeType
  } else {
    bytes = new Uint8Array(await request.arrayBuffer())
    const fn = request.headers.get("x-filename")
    if (fn) filename = sanitizeFilename(fn)
    const mt = request.headers.get("content-type")
    if (mt && !mt.includes("octet-stream")) mimeType = mt
  }

  if (bytes.byteLength === 0) {
    return jsonError("VALIDATION_ERROR", "文件为空")
  }
  if (bytes.byteLength > MAX_FILE_SIZE) {
    return jsonError("FILE_TOO_LARGE", "文件超过 50MB 上限")
  }

  const itemId = generateUUID()
  const key = `users/${auth.userId}/items/${itemId}/${filename}`

  await env.BUCKET.put(key, bytes, {
    httpMetadata: { contentType: mimeType },
  })

  return json({
    success: true,
    r2_key: key,
    item_id: itemId,
    size: bytes.byteLength,
    mime_type: mimeType,
    filename,
  }, 201)
}

// GET /api/files/:key - 读取已加密文件（返回密文）
export async function handleFileGet(request: Request, env: Env, key: string): Promise<Response> {
  const auth = await requireAuth(request, env)

  // 越权防护：校验 key 属于当前用户，防止跨用户读取（IDOR）
  const expectedPrefix = `users/${auth.userId}/`
  if (!key.startsWith(expectedPrefix)) {
    return notFound("文件不存在")
  }

  const obj = await env.BUCKET.get(key)
  if (!obj) return notFound("文件不存在")

  const headers = new Headers()
  // CORS：仅对白名单内的跨域来源返回 CORS 头；同源请求无需 CORS
  const corsOrigin = resolveCorsOrigin(request, env)
  if (corsOrigin) headers.set("Access-Control-Allow-Origin", corsOrigin)
  headers.set("X-Content-Type-Options", "nosniff")
  headers.set("X-Frame-Options", "DENY")
  headers.set("Referrer-Policy", "no-referrer")
  obj.writeHttpMetadata(headers)
  headers.set("etag", obj.httpEtag)
  headers.set("cache-control", "private, max-age=3600")

  return new Response(obj.body, { headers })
}
