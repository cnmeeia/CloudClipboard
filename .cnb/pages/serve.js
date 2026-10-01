#!/usr/bin/env node
/**
 * CNB 云原生开发「仅预览模式」静态服务
 *
 * 用途：让仓库里的 index.html 拥有一个可在线访问的预览地址。
 * 平台约定：业务服务需监听 0.0.0.0:8686，平台探测到端口就绪后自动打开预览页。
 *
 * 零依赖实现，不引入任何 npm 包（避免离线环境安装失败）。
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'

const PORT = Number(process.env.PREVIEW_PORT || 8686)
const HOST = '0.0.0.0'
const ROOT = resolve(process.env.PREVIEW_ROOT || '/workspace')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    let pathname = decodeURIComponent(url.pathname)

    // 防目录穿越
    const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '')
    let filePath = join(ROOT, safe)

    let info = await stat(filePath).catch(() => null)
    if (info?.isDirectory()) {
      filePath = join(filePath, 'index.html')
      info = await stat(filePath).catch(() => null)
    }
    // SPA / 单文件回退
    if (!info) {
      filePath = join(ROOT, 'index.html')
      info = await stat(filePath).catch(() => null)
      if (!info) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('404 Not Found')
        return
      }
    }

    const body = await readFile(filePath)
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    })
    res.end(body)
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(`500 Internal Error: ${err?.message || err}`)
  }
})

server.listen(PORT, HOST, () => {
  console.log(`preview server ready → http://${HOST}:${PORT}`)
  console.log(`serving root: ${ROOT}`)
})
