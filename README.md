# CloudClipboard V2

**Your private clipboard, everywhere.**

跨设备个人私有 Universal Clipboard · **PWA + Bark + E2EE + Cloudflare**

> 复制一次，所有设备可用。无需原生 App，无需 Apple Developer Account。

---

## ✨ 核心理念

**Copy once. Available everywhere. Private by design.**

| 原则 | 实现 |
|---|---|
| 简单 | 打开即用，onboarding 60 秒内完成 |
| 快速 | Cloudflare 边缘网络，毫秒级同步 |
| 私密 | AES-256-GCM 端到端加密，服务器永远看不到明文 |
| 跨平台 | iPhone / iPad / Mac / Windows / Linux / Android |
| 无安装门槛 | 纯 PWA，添加到主屏幕即用 |
| 无原生 App | 不需要 Apple Developer Account |

## 🎯 功能特性

- **多类型剪贴板**：自动识别文本、URL、代码、JSON、颜色、OTP 验证码等，按类型智能渲染
- **大文件支持**：文件经客户端加密后直传 R2，元数据存 D1
- **即时同步**：30 秒轮询 + 页面可见性触发 + 手动刷新，顶栏实时同步状态指示
- **⌘K 命令面板**：全局搜索、快速推送、斜杠指令（`/clear`、`/settings`、`/devices`、`/notifications`、`/theme`）
- **跨设备 E2EE**：每条目独立 AES-256-GCM 密钥，主密钥由**种子短语** PBKDF2 派生，新设备输入同一短语即可解密
- **设备管理**：查看在线设备、重命名、删除（删除即级联清理该设备的剪贴板与 R2 文件）
- **Bark 通知**：新剪贴板 / 设备上线等事件推送到 iPhone，可按类型开关
- **PWA 离线**：添加到主屏幕全屏运行，Workbox 预缓存，新版本可选择刷新
- **响应式 + 动效**：桌面侧栏 / 移动底栏，Framer Motion 页面过渡，遵循 `prefers-reduced-motion`
- **深色模式**：跟随系统或手动指定，偏好跨设备同步

## 🏗️ 架构

```
                    CloudClipboard PWA
                           │
             ┌─────────────┴─────────────┐
             │                           │
           iPhone                       Mac
             │                           │
             └─────────────┬─────────────┘
                           │
                     HTTPS / API
                           │
                           ▼
                 Cloudflare Worker
                           │
            ┌──────────────┼──────────────┐
            │              │              │
            ▼              ▼              ▼
           D1             R2           Bark
        Metadata        Files        通知通道
```

### 技术栈

- **前端**：React 19 · TypeScript · Vite 7 · Tailwind CSS v4 · React Router 8 · Framer Motion · lucide-react
- **PWA**：vite-plugin-pwa（injectManifest）· Workbox 预缓存与离线回退 · 新版本更新提示
- **后端**：Cloudflare Workers · D1 · R2 · Cron · Static Assets（与 Worker 同域部署 SPA）
- **安全**：AES-256-GCM E2EE（Web Crypto API）· 边缘 Zero Trust（Access JWT）认证 · Zod 校验 · 速率限制
- **通知**：Bark（iOS 可靠推送通道）
- **工程**：pnpm workspace Monorepo · Vitest（含 jsdom 组件/视觉 QA）· Playwright · Wrangler

## 📁 项目结构

```text
cloudclipboard/
│
├── apps/
│   ├── web/                    # React PWA
│   │   ├── src/
│   │   │   ├── components/     # UI 组件（RichCard/CommandPalette/SyncIndicator…）
│   │   │   │   ├── settings/   # 设置页分区（连接/外观/安全/Token/关于）
│   │   │   │   └── ui/         # 基础组件适配层（Button/Switch/图标导出）
│   │   │   ├── pages/          # 页面（Onboarding/Dashboard/Clipboard/Detail/Devices/Notifications/Settings）
│   │   │   ├── hooks/          # AppContext 全局状态、解密、复制等 hooks
│   │   │   ├── lib/            # API 客户端、内容识别、动效常量、SW 更新
│   │   │   ├── crypto/         # E2EE 解密（浏览器侧）
│   │   │   ├── storage/        # IndexedDB + localStorage
│   │   │   └── sw.ts           # Service Worker（injectManifest）
│   │   ├── tests/              # Vitest（内容识别 / SW 更新 / 视觉 QA）
│   │   └── public/             # 图标 / manifest
│   │
│   └── worker/                 # Cloudflare Worker
│       ├── src/
│       │   ├── routes/         # API 路由（devices/clipboard/files/push/tokens/prefs/me/health）
│       │   ├── db/             # D1 数据访问层（参数化 SQL）
│       │   ├── push/           # Bark 推送
│       │   ├── auth/           # Access 身份解析与 userId 派生
│       │   └── cron.ts         # 定时清理
│       ├── tests/              # 单元测试
│       └── wrangler.jsonc
│
├── packages/
│   ├── types/                  # 共享类型
│   ├── crypto/                 # E2EE 核心（浏览器/Worker/测试共用）
│   └── shared/                 # Zod Schema、常量、工具
│
├── migrations/                 # D1 迁移
├── scripts/                    # 冒烟测试、E2EE 推送、UI 审计脚本
├── pnpm-workspace.yaml
└── package.json
```

## 🚀 快速开始

### 环境要求

- Node.js ≥ 20.19
- pnpm ≥ 9
- Cloudflare 账号（免费版即可）

### 1. 安装

```bash
pnpm install
```

### 2. 本地开发

```bash
pnpm dev              # 前端开发服务器（Vite）
pnpm dev:worker       # Worker 本地模拟（wrangler dev）
```

### 3. 认证：仅由边缘 Zero Trust 负责，无登录验证

本项目**已移除所有登录验证**（不再使用设备 Bearer token / OTP 配对）：

1. 在 Cloudflare Zero Trust 控制台创建 **Access Application**，接入你的 Worker 域名（如 `clip.example.com`）。
2. 将 Worker 的访问策略设为 **Allow / 指定邮箱或身份提供商**。
3. **⚠️ 生产环境建议配置 Access JWT 验证**（防止绕过 Access 伪造邮箱头）：
   - `CF_ACCESS_AUD` = Zero Trust → Access → 应用 → Application Audience (AUD) Tag
   - `CF_ACCESS_TEAM_DOMAIN` = 你的 team 名（对应 `https://<team>.cloudflareaccess.com`）
   - 配置后 Worker 会校验 `Cf-Access-Jwt-Assertion` 的签名、`iss`、`aud`、`exp`，不再信任裸邮箱头
   - 建议同时设 `FORCE_ACCESS_JWT=true`（fail-closed，防止上线忘配）
   - 详见 `apps/worker/.dev.vars.example` 与 `DEPLOY.md`

- 用户访问时，Cloudflare Access 会在**边缘**完成登录（邮箱 / OTP / SSO），只有通过认证的请求才能到达 Worker。
- Worker 从 Access 注入的 `CF-Access-Authenticated-User-Email` 请求头读取邮箱（未配置 JWT 校验时）或校验 `Cf-Access-Jwt-Assertion`（配置后），派生稳定的 `userId` 用于数据隔离（见 `apps/worker/src/auth/index.ts`）。
- **数据保留**：`userId` 基于邮箱的稳定 SHA-256 派生，应用升级 / 重新登录后设备与剪贴板数据均不丢失。
- **⚠️ 生产环境必须关闭 Worker 的 `*.workers.dev` 子域名路由**（仅保留自定义域名），避免绕过 Access 直接访问 Worker。

本地开发可设置兜底邮箱（`.dev.vars`）：

```bash
CF_ACCESS_DEV_EMAIL="dev@example.com"
```

### 4. D1 迁移

```bash
pnpm db:migrate:local   # 本地数据库
pnpm db:migrate         # 生产数据库（--remote）
```

### 5. 测试

```bash
pnpm test               # E2EE / Zod / 内容识别
pnpm typecheck          # 全仓类型检查
```

### 6. 冒烟测试（Worker 完整链路）

```bash
bash scripts/smoke-worker.sh
```

### 7. 构建

```bash
pnpm build              # 全仓递归构建（web: vite build；worker: typecheck）
```

## ☁️ Cloudflare 部署

### 1. 创建资源

```bash
cd apps/worker
npx wrangler login

# D1 数据库
npx wrangler d1 create cloudclipboard
# 将 database_id 填入 wrangler.jsonc

# R2 存储桶
npx wrangler r2 bucket create cloudclipboard-files
```

### 2. 应用迁移

```bash
pnpm db:migrate
```

### 3. 部署

```bash
pnpm deploy
# = pnpm --filter @cloudclipboard/web build && pnpm --filter @cloudclipboard/worker deploy

# 一键全流程：类型检查 + 远程 D1 迁移 + 前端构建 + Worker 部署
pnpm deploy:full
```

> Worker 通过 Static Assets 将 `apps/web/dist` 与 API 同域托管（SPA 回退，`/api/*` 优先走 Worker），无需单独的前端托管。

## 👀 在线预览 index.html

仓库根目录的 `index.html` 是 **CNB CI/CD Dashboard** 静态页。提供三种免部署的在线预览方式：

### 方式一：CNB 云原生开发（推荐，零配置）

1. 打开仓库分支页，点击右上角 **「在线预览 index.html」** 按钮
2. 环境就绪后点开 **PORTS** 面板，把 `8686` 端口映射出来，即可拿到形如
   `https://<workspace>-8686.cnb.run` 的在线地址

服务端是零依赖 Node 脚本 `.cnb/pages/serve.js`（监听 `0.0.0.0:8686`），
按钮文案在 `.cnb/settings.yml` 的 `workspace.launch.button` 配置。

```bash
# 本地等价复现（无需装依赖）
PREVIEW_ROOT=. PREVIEW_PORT=8686 node .cnb/pages/serve.js
# 然后打开 http://localhost:8686/
```

### 方式二：本机起静态服务

```bash
npx serve -s -l 8686 .        # 或 python3 -m http.server 8686
# 打开 http://localhost:8686/
```

### 方式三：raw 直链（仅下载/查看源码）

```
https://cnb.cool/cnmeeia/ClipBoard/-/git/raw/main/index.html
```

> ⚠️ 注意 `/-/raw/` 并不是原始文件服务（会返回 CNB 的 Next.js 页面），
> 原始文件路径是 **`/-/git/raw/<ref>/<path>`**。
> 该地址返回 `Content-Type: text/plain`，浏览器会以纯文本展示，不能直接渲染页面。

其他站点（如 `htmlpreview.github.io`）无法代理 CNB 文件：
CNB 的 raw 响应 `Access-Control-Allow-Origin` 固定为 `https://docs.cnb.cool`，
且只接受 GitHub 系地址，因此不可用。

## 📱 iPhone 安装


1. 用 **Safari** 打开 CloudClipboard
2. 点击分享 → 「添加到主屏幕」
3. 从主屏幕打开（standalone 模式）
4. 进入「通知」页 → 配置 Bark URL 接收通知

## 🖥️ Mac 安装

1. 用 **Safari** 打开 CloudClipboard
2. 菜单栏「文件」→「添加到程序坞」
3. 从程序坞打开 → 进入「通知」页配置 Bark

## 🔐 安全模型

### 端到端加密（E2EE）

```
plaintext
   ↓ 随机 item key（AES-256-GCM）
ciphertext + IV
   ↓ master key 包装 item key
wrapped_key + salt
   ↓
上传到服务器（只存密文）
```

- 每个剪贴板条目使用**独立随机 AES-256-GCM key + 96-bit IV**
- 设备 **master key** 存储于 IndexedDB（绝不入 localStorage）
- 服务器只保存 ciphertext + wrapped key + metadata
- 服务器**永远无法读取明文**

### 认证

- 登录验证已**全部移除**（无 JWT / 密钥 / token / OTP）。
- 由 Cloudflare Zero Trust（Access）在**边缘**完成登录认证，Worker 仅从注入的邮箱头派生 `userId` 用于数据隔离。
- 设备可重命名 / 撤销。

### 配对（新设备）

无需配对码：在新设备浏览器打开同一 Worker（通过 Cloudflare Access 登录）即可自动加入同一账户。

### 数据清理

- 剪贴板默认 7 天过期（可选手动 TTL；明文记录强制 ≤ 5 分钟）
- Cloudflare Cron 每 30 分钟清理：过期条目及其 R2 文件 / 撤销满 7 天的设备 / 90 天前的审计日志 / 过期限流窗口

## 📡 通知

- **Bark** 作为唯一通知通道（iOS 可靠推送）
- 剪贴板新增时向其他设备发送 Bark 通知（仅提示，不含明文）
- 通知偏好可在「通知」页配置（剪贴板 / 设备上线 / 新设备 / 安全提醒）

## 📦 API 文档

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/health` | 健康检查（Worker/D1/R2，含部署版本元数据，无需鉴权） |
| GET | `/api/me` | 当前用户身份（由邮箱派生的稳定 userId，供前端派生密钥 salt） |
| GET | `/api/prefs` | 读取用户偏好（主题、通知设置等，跨设备同步） |
| PUT | `/api/prefs` | 更新用户偏好 |
| GET | `/api/devices` | 设备列表 |
| POST | `/api/devices/register` | 注册/更新当前设备（upsert） |
| PATCH | `/api/devices/:id` | 重命名设备 / 保存 Bark URL |
| DELETE | `/api/devices/:id` | 删除设备 |
| POST | `/api/push/test` | Bark 测试通知 |
| GET | `/api/clipboard` | 剪贴板列表 |
| POST | `/api/clipboard` | 上传剪贴板（密文） |
| GET | `/api/clipboard/:id` | 单个剪贴板 |
| DELETE | `/api/clipboard/:id` | 删除剪贴板 |
| POST | `/api/files/upload` | R2 文件上传（客户端加密） |
| GET | `/api/files/:key` | R2 文件读取 |
| GET | `/api/tokens` | API Token 列表 |
| POST | `/api/tokens` | 生成 API Token（明文仅显示一次） |
| DELETE | `/api/tokens/:id` | 吊销 API Token |
| POST | `/api/clipboard/plain` | curl 上传剪贴板（支持 passphrase 参数自动 E2EE，明文需 confirmPlaintext:true，需 Token） |

错误格式统一：`{ "success": false, "error": { "code": "...", "message": "..." } }`

### 🔑 API Token（curl / CLI 调用）

浏览器端通过 Cloudflare Access 登录自动认证；**curl / 脚本 / CLI** 则用 API Token 认证，无需登录流程。

1. **生成 Token**：在设置页 → API Token 生成，或在 Web 控制台调用：
   ```bash
   curl -X POST https://<worker>/api/tokens \
     -H "Content-Type: application/json" \
     -d '{"name":"macbook"}'
   ```
   > 明文 Token（`cca_...`）**仅生成时返回一次**，服务器只存 SHA-256 哈希，请立即保存。

2. **上传剪贴板（E2EE，推荐）**：
   ```bash
   curl -X POST https://<worker>/api/clipboard/plain \
     -H "Authorization: Bearer cca_你的Token" \
     -H "Content-Type: application/json" \
     -d '{"content":"要上传的内容", "type":"text", "passphrase":"你的种子短语"}'
   ```
   > 服务器用 PBKDF2 从 `passphrase` 派生密钥，对内容做 AES-256-GCM 加密后存储，
   > `plain=0`，数据库内只有密文。前端输入相同 passphrase（种子短语）即可解密。

3. **上传剪贴板（CLI 本地 E2EE）**：
   使用 `scripts/e2ee-push.mjs` 在本地完成加密后再上传（真正的端到端加密，服务器接触不到明文）：
   ```bash
   node scripts/e2ee-push.mjs \
     --url https://<worker> \
     --token cca_你的Token \
     --seed "你的种子短语" \
     --content "要上传的内容"
   ```
   > ⚠️ 若 Worker 部署在 **Cloudflare Access** 之后，CLI/curl 请求默认会被边缘拦截并重定向到登录页。
   > 请在 [Zero Trust → Access → Service Auth] 创建 **Service Token**，并加入该 Access 应用的授权，
   > 然后设置 `CF_ACCESS_CLIENT_ID` 与 `CF_ACCESS_CLIENT_SECRET` 环境变量，脚本会自动带上认证头：
   > ```bash
   > export CF_ACCESS_CLIENT_ID="..." CF_ACCESS_CLIENT_SECRET="..."
   > ```

4. **上传剪贴板（明文，不推荐）**：
   ```bash
   curl -X POST https://<worker>/api/clipboard/plain \
     -H "Authorization: Bearer cca_你的Token" \
     -H "Content-Type: application/json" \
     -d '{"content":"要上传的内容", "type":"text", "confirmPlaintext":true}'
   ```
   > ⚠️ 明文上传不经 E2EE，服务器可见明文。**必须显式传 `confirmPlaintext:true`**（防止误用导致明文落库），
   > 且明文记录 TTL 强制 ≤ 5 分钟。仅建议个人自用 / 脚本推送。

5. **吊销 Token**：`DELETE /api/tokens/:id`（携带 `Authorization: Bearer`）。

## 🧪 测试

```bash
pnpm test
```

| 模块 | 覆盖 |
|---|---|
| `packages/crypto` | AES-256-GCM round-trip、wrong key / wrong IV / tampered ciphertext 必须失败、key 包装、配对密钥派生 |
| `apps/worker` | Zod Schema、平台检测、Rate Limit key |
| `apps/web` | 内容智能识别（URL/Shell/JSON/OTP/颜色）、Service Worker 更新流程、设计系统视觉 QA（静态检查） |
| 冒烟脚本 | 注册设备 → 剪贴板密文全链路 |

> Web 端测试基于 Vitest + jsdom；UI 审计与截图回归使用 Playwright（见 `scripts/ui-audit-engine.js`）。

## 🧭 V2 路线图

- [x] pnpm Monorepo + React 19 + Tailwind v4
- [x] E2EE（wrapped key 跨设备模式 + 种子短语 PBKDF2 派生，新设备输入短语即可解密）
- [x] 设备管理（边缘 Zero Trust 认证，无配对码）
- [x] D1 + R2 + Cron
- [x] Bark 通知
- [x] Dashboard / 剪贴板 / 详情 / 设备 / 通知 / 设置页面
- [x] ⌘K 命令面板（搜索 / 推送 / 斜杠指令）
- [x] PWA 离线缓存与版本更新提示
- [x] Vitest + Playwright 视觉 QA 基础
- [ ] master key QR 加密交换（种子短语之外的可选近场传输）
- [ ] 离线队列（网络恢复自动补传）
- [ ] 完整 Playwright E2E 交互测试（当前以视觉 QA 静态检查为主）
- [ ] CLI / 浏览器扩展 / Raycast
- [ ] NAS / S3 自托管存储

## 📄 License

MIT
