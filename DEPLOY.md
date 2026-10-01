# CloudClipboard V2 部署指南

## 前置条件

- Cloudflare 账号（Workers 免费版即可）
- Node.js ≥ 20.19 + pnpm ≥ 9
- wrangler CLI（已随依赖安装）

## 一、本地开发

```bash
pnpm install
cp apps/worker/.dev.vars.example apps/worker/.dev.vars  # 或从根 .dev.vars 复制
pnpm db:migrate:local         # 本地 D1 迁移
pnpm dev                      # 前端
pnpm dev:worker               # Worker 本地模拟
```

## 二、Cloudflare 资源

```bash
cd apps/worker

# 1. D1 数据库
npx wrangler d1 create cloudclipboard
# 输出 database_id，填入 wrangler.jsonc 的 d1_databases[0].database_id

# 2. R2 存储桶
npx wrangler r2 bucket create cloudclipboard-files
```

## 三、密钥配置

```bash
cd apps/worker

# 方式 A：逐个配置
npx wrangler secret put CF_ACCESS_DEV_EMAIL

# 方式 B：从 .dev.vars 批量
pnpm secrets   # = wrangler secret bulk < .dev.vars
```

## 四、数据库迁移

```bash
# 本地
pnpm db:migrate:local

# 生产（--remote）
pnpm db:migrate
```

## 五、构建与部署

```bash
# 全量
pnpm deploy

# 或分步
pnpm --filter @cloudclipboard/web build
pnpm --filter @cloudclipboard/worker deploy
```

## 六、验证

```bash
# 健康检查（公开）
curl https://<your-worker>.workers.dev/api/health

# 冒烟测试（本地全链路）
bash scripts/smoke-worker.sh
```

## 六·五、iPhone PWA 如何看到新版（重要）

> 提示词 D：仅合并仓库 ≠ 线上生效，PWA 用户可能因 Service Worker 缓存仍看到旧版。

1. **必须部署后才算上线**：合并 PR 后需执行 `pnpm deploy`（或 `pnpm --filter @cloudclipboard/web build && pnpm --filter @cloudclipboard/worker deploy`）。**仅合并仓库代码不会自动更新线上 Worker。**
2. **iPhone 普通刷新可能仍是旧 SW 缓存**：本项目已启用 `skipWaiting` + `clients.claim`，理论上新版本 SW 激活后会自动接管；但 iOS Safari/PWA 的 SW 生命周期偶尔滞后。
   - 若仍看到旧版，建议：**彻底划掉 PWA 再重新打开**；
   - 或：**长按图标 → 删除 PWA → 重新「添加到主屏幕」**（会重建缓存）；
   - 也可在 Safari 设置中**清除网站数据**后重装。
3. **用户侧强更一次**：即便已配置 `NetworkFirst` 导航壳 + `StaleWhileRevalidate` 静态资源，首次发布后仍建议用户手动强更一次，确保缓存版本对齐。

## 七、故障排查

| 症状 | 原因 | 解决 |
|---|---|---|
| `/api/health` 返回 `d1: false` | D1 未绑定 | 检查 wrangler.jsonc d1_databases |
| 注册返回 `D1_ERROR` | 迁移未应用 | `pnpm db:migrate` |
| Bark 不通知 | URL 未保存或格式错误 | 通知页重新保存 Bark URL |
| 跨设备无法解密 | master key 未共享 | 在通知页 / 设置页导出并导入加密密钥 |

## 八、安全须知

- 剪贴板内容**客户端加密后上传**（AES-256-GCM 端到端加密），服务器无解密能力
- 登录验证已移除，由 Cloudflare Zero Trust（Access）在边缘完成认证
- **⚠️ 生产环境必须正确配置 Cloudflare Zero Trust Access**：
  - 必须确保每个请求都携带 `CF-Access-Authenticated-User-Email` 或 `CF-Access-Authenticated-User-Principal-Name` 请求头
  - 如果未配置 Zero Trust 且未设置 `CF_ACCESS_DEV_EMAIL`，Worker 将拒绝所有请求（返回 401），避免多用户共享同一 unknown userId 导致数据串号
  - 本地开发时设置 `CF_ACCESS_DEV_EMAIL` 作为兜底身份
- **⚠️ 必须配置 Access JWT 验证**（防止绕过 Access 伪造邮箱头）：
  - `CF_ACCESS_AUD` = Zero Trust → Access → 应用 → Application Audience (AUD) Tag
  - `CF_ACCESS_TEAM_DOMAIN` = 你的 team 名（对应 `https://<team>.cloudflareaccess.com`）
  - 配置后 Worker 会校验 `Cf-Access-Jwt-Assertion` 的签名与 aud，不再信任裸邮箱头
  - 建议同时设置 `FORCE_ACCESS_JWT=true`（fail-closed：未配置完 JWT 就拒绝所有请求，防止上线时忘配）
- **JWT sub 用户绑定**：
  - 认证通过后自动 upsert `users` 表（`cf_subject` 列），绑定 JWT 的 `sub` 作为唯一用户标识
  - `cf_subject` 与 `email` 解耦：即使邮箱变更，`sub` 保持不变（用户数据不丢失）
  - 迁移 `0003_user_cf_subject.sql` 已添加 `cf_subject` 列 + UNIQUE 索引
- **⚠️ 生产环境必须关闭 `*.workers.dev` 子域名路由**（Cloudflare 控制台 → Worker → 设置 → 关闭 workers.dev 路由），仅保留自定义域名
- 生产环境务必使用 HTTPS（Workers 默认提供）

## 九、生产上线检查清单

- [ ] `pnpm install && pnpm typecheck && pnpm test` 通过
- [ ] `pnpm db:migrate` 应用所有迁移
- [ ] Cloudflare Zero Trust Access 已正确接入 Worker 域名
- [ ] 验证 Access 正确注入 `CF-Access-Authenticated-User-Email` 头
- [ ] 已配置 `CF_ACCESS_AUD` + `CF_ACCESS_TEAM_DOMAIN`（wrangler secret put）
- [ ] 已设置 `FORCE_ACCESS_JWT=true`（生产强制 JWT 校验，fail-closed）
- [ ] Cloudflare 控制台已关闭 Worker 的 `*.workers.dev` 子域名路由（仅保留自定义域名）
- [ ] `ALLOWED_ORIGINS` 与部署域名一致
- [ ] 冒烟测试 `bash scripts/smoke-worker.sh` 通过
- [ ] Cron 触发器（每 30 分钟）已配置
