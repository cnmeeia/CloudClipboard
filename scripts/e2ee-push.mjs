#!/usr/bin/env node
/**
 * CloudClipboard E2EE 推送工具
 *
 * 在本地完成端到端加密（E2EE），再通过 /api/clipboard 上传到服务器。
 * 服务器永远看不到明文。
 *
 * 用法：
 *   # 方式一：命令行直接传内容（注意：Shell 会把 \ + 换行折叠掉，多行请用下方 stdin/file）
 *   node scripts/e2ee-push.mjs \
 *     --url https://your-worker.workers.dev \
 *     --token cca_your_api_token \
 *     --seed "你的种子短语" \
 *     --content "要加密上传的内容" \
 *     [--type text|url|code] \
 *     [--ttl 604800000] \
 *     [--name "macbook"]
 *
 *   # 方式二：从标准输入读取（推荐，保留原始换行/空格，适合剪贴板管道）
 *   pbpaste | node scripts/e2ee-push.mjs \
 *     --url ... --token ... --seed ... --stdin
 *
 *   # 方式三：从文件读取（保留多行格式）
 *   node scripts/e2ee-push.mjs \
 *     --url ... --token ... --seed ... --file ./command.txt
 *
 * 也可通过环境变量：
 *   export CC_WORKER_URL=... CC_API_TOKEN=... CC_SEED_PHRASE=...
 *
 * 若 Worker 部署在 Cloudflare Zero Trust（Access）之后，请额外提供 Access 服务令牌：
 *   export CF_ACCESS_CLIENT_ID=... CF_ACCESS_CLIENT_SECRET=...
 * 脚本会自动带上 CF-Access-Client-Id / CF-Access-Client-Secret 请求头以通过边缘认证。
 */

import fs from "node:fs"
import { encryptClipboardContent, deriveMasterKeyFromSeed } from "../packages/crypto/src/index.ts"

// ──────────────────────────────
// 参数解析
// ──────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  const opts = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a.startsWith("--")) {
      const key = a.slice(2)
      const val = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : ""
      opts[key] = val
    }
  }
  return opts
}

function getParam(opts, keys, envNames) {
  for (const k of keys) if (opts[k] && opts[k].length > 0) return opts[k]
  for (const e of envNames) if (process.env[e] && process.env[e].length > 0) return process.env[e]
  return null
}

/**
 * 从 stdin 读取全部内容（保留原始换行/空格，不做任何 trim）。
 * 用于剪贴板管道输入：pbpaste | pnpm e2ee:push --stdin ...
 */
async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  return Buffer.concat(
    chunks.map((chunk) =>
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    )
  ).toString("utf8")
}

// ──────────────────────────────
// 工具函数
// ──────────────────────────────

function printHelp() {
  console.log(`
CloudClipboard E2EE 推送工具
============================

在本地加密内容，上传到 CloudClipboard 服务器。服务器只存储密文。

用法：
  方式一（直接传内容）：
    node scripts/e2ee-push.mjs --url <WORKER_URL> --token <API_TOKEN> --seed <SEED_PHRASE> --content <CONTENT>
  方式二（stdin，推荐，保留原始换行/空格）：
    pbpaste | node scripts/e2ee-push.mjs --url ... --token ... --seed ... --stdin
  方式三（文件）：
    node scripts/e2ee-push.mjs --url ... --token ... --seed ... --file <FILE>

参数（内容三选一，优先级 --stdin > --file > --content）：
  --url       CloudClipboard Worker 地址（如 https://your-worker.workers.dev）
  --token     API Token（Bearer 认证，cca_ 开头）
  --seed      种子短语 / passphrase（>= 8 字符，与前端设置页种子短语一致）
  --stdin     从标准输入读取内容（推荐剪贴板同步：pbpaste | ... --stdin）
  --file      从文件读取内容（保留多行格式，如代码/JSON/Markdown）
  --content   命令行直接传内容（⚠️ Shell 会把 \ + 换行续行折叠掉，多行请用 --stdin/--file 或 $'...'）
  --type      内容类型：text | url | code（默认 text）
  --ttl       过期时间（毫秒，默认 7 天）
  --name      设备名称（默认 "API"）
  --help      显示帮助

也可通过环境变量：CC_WORKER_URL、CC_API_TOKEN、CC_SEED_PHRASE
Worker 部署在 Cloudflare Access 之后时，还需设置：CF_ACCESS_CLIENT_ID、CF_ACCESS_CLIENT_SECRET

示例（从剪贴板管道上传，保留完整多行格式）：
  pbpaste | node scripts/e2ee-push.mjs \\
    --url https://clip.example.workers.dev \\
    --token cca_abc123 \\
    --seed "我的秘密短语" \\
    --stdin \\
    --type code

示例（从文件上传）：
  node scripts/e2ee-push.mjs --url ... --token ... --seed "我的秘密短语" --file ./command.txt

⚠️  内容不会做任何 trim，首尾换行/空格会原样进入加密流程；
    请确保种子短语与前端「设置 → 种子短语」一致，否则前端无法解密。
`)
}

// ──────────────────────────────
// 主流程
// ──────────────────────────────

async function main() {
  const opts = parseArgs()

  if (opts.help !== undefined || opts.h !== undefined) {
    printHelp()
    process.exit(0)
  }

  const workerUrl = getParam(opts, ["url", "worker-url"], ["CC_WORKER_URL"])
  const apiToken = getParam(opts, ["token", "api-token"], ["CC_API_TOKEN"])
  const seedPhrase = getParam(opts, ["seed", "passphrase"], ["CC_SEED_PHRASE"])
  const type = opts.type || "text"
  const ttl = opts.ttl ? Number(opts.ttl) : null
  const deviceName = opts.name || "API"

  // 内容输入支持三种模式（优先级：--stdin > --file > --content）：
  //   --stdin   从标准输入读取（推荐，剪贴板管道 pbpaste | ... --stdin，换行/空格原样保留）
  //   --file    从文件读取（保留多行格式）
  //   --content 命令行直接传（注意：Shell 会把 \ + 换行的续行折叠掉，多行需用 $'...' 或走 stdin/file）
  // 所有来源都不做 trim，确保首尾换行/空格原样进入加密流程。
  let content
  if (opts.stdin !== undefined && !process.stdin.isTTY) {
    content = await readStdin()
  } else if (opts.stdin !== undefined && process.stdin.isTTY) {
    console.error("❌ --stdin 需要从管道/重定向输入（如 pbpaste | pnpm e2ee:push --stdin ...）。当前为终端直连，未读到内容。")
    process.exit(1)
  } else if (opts.file) {
    try {
      content = await fs.promises.readFile(opts.file, "utf8")
    } catch (e) {
      console.error(`❌ 无法读取文件 ${opts.file}：${e.message}`)
      process.exit(1)
    }
  } else {
    content = getParam(opts, ["content", "text"], []) || ""
  }

  // Cloudflare Zero Trust（Access）服务令牌：Worker 部署在 Access 之后时，
  // CLI / curl 请求需带上这两个头才能通过边缘认证到达 Worker。
  const cfAccessClientId = process.env.CF_ACCESS_CLIENT_ID || null
  const cfAccessClientSecret = process.env.CF_ACCESS_CLIENT_SECRET || null

  // 构建请求头：Bearer 认证（cca_ API Token）+ 可选 Access 服务令牌
  const authHeaders = {
    Authorization: `Bearer ${apiToken}`,
    ...(cfAccessClientId && cfAccessClientSecret
      ? {
          "CF-Access-Client-Id": cfAccessClientId,
          "CF-Access-Client-Secret": cfAccessClientSecret,
        }
      : {}),
  }

  // 校验参数
  if (!workerUrl) {
    console.error("❌ 缺少 Worker URL。使用 --url 或设置 CC_WORKER_URL 环境变量。")
    process.exit(1)
  }
  if (!apiToken) {
    console.error("❌ 缺少 API Token。使用 --token 或设置 CC_API_TOKEN 环境变量。")
    process.exit(1)
  }
  if (!seedPhrase || seedPhrase.length < 8) {
    console.error("❌ 缺少种子短语（>= 8 字符）。使用 --seed 或设置 CC_SEED_PHRASE 环境变量。")
    process.exit(1)
  }
  if (content === undefined || content === null || content.length === 0) {
    console.error("❌ 缺少要上传的内容。请使用 --content，或 --file <文件>，或管道 --stdin。")
    process.exit(1)
  }
  if (!["text", "url", "code"].includes(type)) {
    console.error("❌ 无效的 type，仅支持：text | url | code")
    process.exit(1)
  }

  const baseUrl = workerUrl.trim().replace(/\/+$/, "")

  try {
    // 1. 获取当前用户 ID（用于派生 salt）
    console.log("📡 获取用户身份...")
    let meRes
    try {
      meRes = await fetch(`${baseUrl}/api/me`, {
        headers: authHeaders,
      })
    } catch (e) {
      console.error(`❌ 无法连接 Worker：${e.message}`)
      console.error(`   请检查 CC_WORKER_URL 是否可达：${baseUrl}`)
      process.exit(1)
    }
    const rawText = await meRes.text().catch(() => "")
    let meData = null
    try {
      meData = rawText ? JSON.parse(rawText) : null
    } catch {
      meData = null
    }
    if (!meRes.ok) {
      // 非 2xx：区分 Access 边缘拦截（HTML 重定向/登录页）与 Worker 返回的 JSON 错误
      const isHtml = /^\s*</.test(rawText)
      if (isHtml) {
        console.error(`❌ /api/me 返回 HTML（HTTP ${meRes.status}），请求被 Cloudflare Access 拦截。`)
        if (!cfAccessClientId || !cfAccessClientSecret) {
          console.error("   👉 若 Worker 部署在 Cloudflare Access 之后，请在环境变量中设置 CF_ACCESS_CLIENT_ID 与 CF_ACCESS_CLIENT_SECRET（Access 服务令牌），脚本会自动携带认证头。")
        } else {
          console.error("   👉 已提供 CF_ACCESS_CLIENT_ID/SECRET 但仍被拦截，请检查服务令牌是否正确、是否已添加到 Access 应用的 Service Token 授权。")
        }
        process.exit(1)
      }
      const errMsg = meData?.error?.message || `请求失败 (HTTP ${meRes.status})`
      console.error(`❌ 无法获取用户身份：${errMsg}（HTTP ${meRes.status}）`)
      console.error("   请检查：1) CC_WORKER_URL 是否可达；2) API Token 是否有效；3) D1 数据库是否已迁移（pnpm db:migrate）。")
      process.exit(1)
    }
    if (!meData?.success || !meData?.user?.id) {
      console.error("❌ 无法获取用户身份，请检查 API Token 是否有效。")
      process.exit(1)
    }
    const userId = meData.user.id
    console.log(`   ✓ userId: ${userId.slice(0, 16)}...`)

    // 2. 用种子短语派生 master key（与前端同算法：PBKDF2 + AES-256-GCM）
    console.log("🔐 派生加密密钥（PBKDF2）...")
    const masterKey = await deriveMasterKeyFromSeed(seedPhrase, userId)

    // 3. 在本地加密内容（服务器永远看不到明文）
    console.log("🔒 本地加密内容（AES-256-GCM）...")
    const { encrypted, iv, wrappedKey, salt } = await encryptClipboardContent(content, masterKey)

    // 4. 上传加密后的数据
    console.log(`📤 上传到 ${baseUrl}/api/clipboard ...`)
    const payload = {
      type,
      encrypted_data: encrypted,
      iv,
      salt,
      wrapped_key: wrappedKey,
      expires_in: ttl,
    }

    const uploadRes = await fetch(`${baseUrl}/api/clipboard`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        "x-device-name": deviceName,
      },
      body: JSON.stringify(payload),
    })
    const uploadData = await uploadRes.json().catch(() => null)

    if (!uploadRes.ok || !uploadData?.success) {
      const errMsg = uploadData?.error?.message || `上传失败 (HTTP ${uploadRes.status})`
      console.error(`❌ 上传失败：${errMsg}`)
      process.exit(1)
    }

    // 5. 输出结果
    const item = uploadData.item
    console.log(`\n✅ 上传成功！`)
    console.log(`   item ID:  ${item.id}`)
    console.log(`   类型:     ${item.type}`)
    console.log(`   密文:     ${item.encrypted_data.slice(0, 32)}...`)
    console.log(`   创建时间: ${new Date(item.created_at).toLocaleString()}`)
    console.log(`   过期时间: ${new Date(item.expires_at).toLocaleString()}`)
    console.log(`   E2EE:     ✅ 已加密（服务器只存密文）`)
    console.log(`\n💡 在 Web 端使用相同种子短语即可解密此内容。`)
  } catch (e) {
    console.error(`❌ 执行出错：${e.message}`)
    process.exit(1)
  }
}

main()
