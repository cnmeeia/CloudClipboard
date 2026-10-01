# CloudClipboard iOS 原生客户端 — Phase 1 现状审计

> 本文档基于对仓库真实代码的逐文件阅读（不是假设）。
> 审计范围：`apps/worker`、`packages/*`、`apps/web`、`migrations`、`apps/worker/wrangler.jsonc`。

## 1. 仓库结构（真实）

```
.
├── apps/
│   ├── web/            # Vite + React PWA（frontend，构建产物进 Worker assets）
│   └── worker/         # Cloudflare Worker（API + D1 + R2 + Cron + Bark）
├── packages/
│   ├── crypto/         # E2EE 核心：AES-256-GCM + PBKDF2（Web/Worker 共用）
│   ├── shared/         # 常量、Zod schema、平台检测（Web/Worker 共用）
│   └── types/          # API 请求/响应类型（Web/Worker 共用）
├── migrations/         # D1 schema（0001 ~ 0005）
├── scripts/            # UI audit / smoke 脚本
└── index.html          # 仓库根目录的落地页（非 PWA 入口）
```

- Worker 名称：`cloudclipboard`
- 自定义域：`clip.0272.de5.net`（`wrangler.jsonc` → `routes[0].pattern`）
- Worker 同时托管 Web 静态资源（`assets.directory = ../web/dist`），`run_worker_first: ["/api/*"]`
- D1 binding: `DB`；R2 binding: `BUCKET`（bucket `cloudclipboard-files`）
- Cron: `*/30 * * * *`（清理过期条目）

## 2. 认证（关键结论：iOS 无法直接复用 Cloudflare Access）

**现有实现**（`apps/worker/src/auth/index.ts`）认证优先级：

1. `Authorization: Bearer cca_...` → **API Token**（`api_tokens` 表，只存 SHA-256 哈希）
2. `Cf-Access-Jwt-Assertion` → Cloudflare Access JWT（JWKS 验签 + iss + aud）
3. `CF-Access-Authenticated-User-Email` 头 → 仅本地开发回退

用户身份：`userId = "cf_" + sha256(email.toLowerCase()).hex.slice(0,32)`
（`identityUserId()`，稳定、跨设备一致，用于数据隔离 **以及 PBKDF2 盐的一部分**）

**对 iOS 的影响（必须记录的真实约束）**：

- Cloudflare Access 是浏览器重定向 + Cookie 流程，原生 App 无法拿到 `Cf-Access-Jwt-Assertion`。
- 因此 **iOS 端唯一可行的认证方式是 API Token（`Authorization: Bearer cca_...`）**。
- API Token 在 Web 端已可生成（`POST /api/tokens`，`Setting → API Token`）。
- ⚠️ `userId` 是从**邮箱**派生的，而 API Token 认证路径下 `auth.userId = row.user_id`（即创建
  token 时就已固化的同一个 `cf_...` id）→ **userId 一致，E2EE 派生的 master key 一致**，
  Web 与 iOS 密文可以互通。这是整个方案成立的前提，已确认成立。
- iOS 侧不需要、也没有实现 Access JWT 校验（不伪造身份头）。

## 3. API 清单（与 `apps/worker/src/index.ts` 逐一核对）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查，公开 |
| GET | `/api/me` | 返回 `{ user: { id } }`（PBKDF2 盐用） |
| GET/PUT | `/api/prefs` | 主题（system/light/dark）+ 通知偏好 |
| GET | `/api/devices` | 设备列表 |
| POST | `/api/devices/register` | 注册/更新当前设备（upsert） |
| PATCH/DELETE | `/api/devices/:id` | 重命名（含 `bark_url`）/ 删除 |
| POST | `/api/push/test` | Bark 测试推送 |
| GET | `/api/clipboard?limit=n` | 列表（服务端 clamp 1..200） |
| POST | `/api/clipboard` | 上传 E2EE 密文 |
| POST | `/api/clipboard/plain` | curl 明文/E2EE 上传（API Token） |
| GET/DELETE | `/api/clipboard/:id` | 单条（图片/文件额外返回 `base64_content`） |
| GET/POST | `/api/tokens` | 列出 / 生成 API Token（明文仅返回一次） |
| DELETE | `/api/tokens/:id` | 吊销 |
| POST | `/api/files/upload` | R2 上传（客户端加密） |
| GET | `/api/files/:key` | R2 读取 |

统一响应：`{ success: boolean, error?: { code, message }, ... }`；错误码示例：
`VALIDATION_ERROR` / `NOT_FOUND` / `UNAUTHORIZED` / `RATE_LIMITED` / `INSERT_ERROR`。
限流：`RATE_LIMITS`（shared）——`clipboard:list` 120/min，`clipboard:create` 120/min，
`devices:register` 10/min，`files:upload` 30/min，默认 200/min；命中返回 429 + `Retry-After`。

**请求头约定**（iOS 必须一致）：`x-device-id`、`x-device-name`、`Content-Type: application/json`。
`device_type` 仅接受 `pwa | cli | extension | other`（`registerDeviceSchema`）→ **iOS 客户端注册时用 `other`**，
`platform` 传 `ios`，`browser` 传 iOS 版本串（避免 "AppleWebKit" 之类被 UI 误当浏览器）。

## 4. E2EE 加密（`packages/crypto/src/index.ts`）— iOS 必须 1:1 复刻

```
base64url: 无 padding、+ → -、/ → _
masterKey = PBKDF2(seedPhrase, salt = "cloudclipboard:v1:" + userId,
                   iterations = 310000, hash = SHA-256, dkLen = 256bit) → AES-GCM key

每条目：
  itemKey       = 随机 AES-256 key
  {encrypted,iv}= AES-256-GCM(itemKey, plaintext)          // iv = 12 随机字节，tag = 128bit
  wrappedKey    = AES-256-GCM(masterKey, raw(itemKey),
                              iv = salt(12 随机字节),
                              aad = "cloudclipboard:item-key:v1")
                  + 16 字节 auth tag
解密：masterKey 解包 → itemKey → 解密密文
```

- **注意**：`packages/crypto` 注释里写的盐前缀是 `cloudclipboard:v1:`（`SEED_SALT_PREFIX`），
  `docs`/旧注释里出现的 `cloudclipboard:` 是过期描述 —— iOS 以代码为准，用 `cloudclipboard:v1:`。
- iOS 使用 `CryptoKit`：`AES.GCM.seal/open` + `HKDF` 不适用（PBKDF2 需 `CommonCrypto` 的
  `CCKeyDerivationPBKDF`，Swift 原生无 PBKDF2）。
- 数据兼容目标：**Web 加密 → iOS 解密 → iOS 加密 → Web 解密**，见 `apps/ios/CloudClipboardTests/CryptoInteropTests.swift`。
- `plain = 1` 的条目（curl 明文上传）iOS 不解密，直接显示明文并标注"未加密"。

## 5. D1 schema（`migrations/0001~0005`）

- `users(id, email, display_name, created_at, updated_at, last_login_at, theme, cf_subject)`
- `devices(id, user_id, name, platform, browser, device_type, bark_url, last_seen, created_at, updated_at, revoked_at)`
- `clipboard_items(id, user_id, device_id, type, encrypted_data, iv, salt, wrapped_key, r2_key, size, mime_type, filename, plain, created_at, expires_at)`
- `api_tokens(id, user_id, token_hash, name, created_at, last_used_at, expires_at, revoked_at)`
- `audit_logs`、`rate_limits`

索引：`clipboard_items(user_id, created_at DESC)`、`expires_at` 部分索引等。

**iOS 不做任何 schema 变更**，离线缓存使用本地 SwiftData，字段名与 API JSON 对齐。

## 6. 现有 Web 功能 → iOS 对应实现

| Web 功能 | iOS 实现 |
|---|---|
| 列表 + 类型智能渲染（text/url/code/json/color/otp） | `ClipboardListView` + `ContentRenderer`（SwiftUI） |
| 推送当前剪贴板（E2EE 加密后上传） | `UIPasteboard` + `CryptoService` + `ClipboardRepository.push` |
| 点击复制 + Toast | `UIPasteboard.general.string` + `HapticManager` + Toast overlay |
| 搜索 / ⌘K 命令面板 | `.searchable` + `CommandPaletteView`（Sheet） |
| 详情页（含图片/文件 base64、R2） | `ClipboardDetailView`（base64 解码 → `Image` / QuickLook） |
| 设置（主题、Worker URL、设备、通知、API Token、种子短语、关于） | `SettingsView` 分区 |
| 设备管理（重命名 / Bark URL / 删除） | `DevicesView` |
| 主题三态 + 跨设备同步 | `AppearanceService` ↔ `GET/PUT /api/prefs` |
| 30s 轮询 + visibility 触发 | `SyncScheduler`（前台 30s Timer + `BGAppRefreshTask`） |
| PWA 离线缓存 | SwiftData 本地库 + `SyncState` |
| Bark 通知 | 保留服务端 Bark；iOS 侧新增 `UNUserNotificationCenter` 本地/远程通知 + Deep Link |
| 种子短语主密钥（IndexedDB） | **Keychain**（`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`） |
