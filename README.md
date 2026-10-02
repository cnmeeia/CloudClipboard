# CloudClipboard iOS — 原生客户端

**不是 WKWebView 套壳。** 这是一个 SwiftUI 原生 iOS App，复用你现有的
Cloudflare Worker / D1 / R2 / E2EE 后端，与 Web 端共享账号、数据与加密格式。

- Swift 5.9 · SwiftUI · Swift Concurrency · Observation
- iOS 17+（为 iOS 26 Liquid Glass 做了 `#available` 适配与兼容开关）
- 全部使用 Apple 原生框架，**零第三方依赖**

---

## 快速开始

### 1. 生成 Xcode 工程

`.xcodeproj` 是机器生成的巨型文件，本仓库用 [XcodeGen](https://github.com/yonaskolb/XcodeGen)
以 `project.yml` 作为单一事实来源：

```bash
brew install xcodegen
cd apps/ios
xcodegen generate          # 生成 CloudClipboard.xcodeproj
open CloudClipboard.xcodeproj
```

### 2. 构建 / 测试 / 归档

```bash
./scripts/build-ios.sh            # CI 模式：无签名构建，验证 BUILD SUCCEEDED
./scripts/build-ios.sh simulator  # 模拟器构建
./scripts/build-ios.sh device     # 真机构建（无签名；加 TEAM=xxx 启用本地签名）
./scripts/test-ios.sh             # 单元测试（含 E2EE 跨端互通）
./scripts/archive-ios.sh          # 无签名 .xcarchive（不可分发，仅验证流程）
TEAM=ABCDE12345 ./scripts/archive-ios.sh   # 使用自己的 Personal Team 签名
```

等价的裸命令（任务书要求的形式）：

```bash
xcodebuild -project apps/ios/CloudClipboard.xcodeproj \
  -scheme CloudClipboard \
  -sdk iphoneos \
  CODE_SIGNING_ALLOWED=NO \
  build
```

### 3. 首次启动配置

App 启动后在引导页填两项：

| 项目 | 从哪里来 |
|---|---|
| 服务器地址 | 默认 `https://clip.0272.de5.net`（现有 PWA 域名） |
| 访问令牌 | Web 端 **设置 → API Token → 生成**，复制 `cca_...` |
| 种子短语 | 与 Web 端**完全相同**的种子短语（否则历史记录无法解密） |

> **为什么用 API Token 而不是 Cloudflare Access？**
> Access 是浏览器重定向 + Cookie 流程，原生 App 拿不到 `Cf-Access-Jwt-Assertion`。
> Worker 的 `requireAuth()` 已支持 `Authorization: Bearer cca_...`，且该 token 行里
> 固化的 `user_id` 与 Web 端完全一致 → PBKDF2 盐一致 → **主密钥一致 → 密文互通**。
> 详见 `docs/ios-audit.md` §2。

---

## 免费 Apple ID（Personal Team）真机安装

不需要付费 Apple Developer Program 也能装到自己的 iPhone 上：

1. **Xcode → Settings → Accounts → +** 用普通 Apple ID 登录，Xcode 会自动创建 Personal Team。
2. 打开 `CloudClipboard.xcodeproj`，选中 **CloudClipboard** target →
   **Signing & Capabilities** → 勾选 *Automatically manage signing* →
   Team 选你的 Personal Team。
3. **改 Bundle ID**（Personal Team 的 ID 必须在你的账号下唯一）：
   把 `de.cloudclipboard.ios.dev` 改成 `com.<你的名字>.cloudclipboard`。
   四个 target 都要改（App / Widget / Share Extension / Intents），
   Extension 的 ID 用主 App ID 加后缀，例如 `com.you.cloudclipboard.widget`。
4. **删除 App Groups 能力**（Personal Team 不支持）：
   四个 target 的 *Signing & Capabilities* 里删掉 **App Groups**。
   代码会自动回退到沙盒目录（`SharedStore.isAppGroupAvailable == false`），
   主 App 与 Share Extension 仍可通过 Keychain 共享令牌。
5. **Universal Links 不可用**（同样需要付费账号）：
   `Info.plist` 里的 `com.apple.developer.associated-domains` 与 entitlements 中的
   同名条目需要删除或忽略，否则签名会报错。Custom URL Scheme
   （`cloudclipboard://`）不受影响，仍然可用。
6. iPhone 上 **设置 → 隐私与安全性 → 开发者模式 → 打开**，重启手机。
7. Xcode 选中你的设备 → Run。首次运行会提示"不受信任的开发者"：
   iPhone **设置 → 通用 → VPN与设备管理 → 信任你的 Apple ID**。
8. Personal Team 的证书 **7 天过期**，到期后重新 Run 一次即可。

---

## 项目结构

```
apps/ios/
├── project.yml                     # XcodeGen 工程定义（改工程配置改这里）
├── scripts/
│   ├── build-ios.sh                # 构建
│   ├── test-ios.sh                 # 测试
│   ├── archive-ios.sh              # 归档
│   ├── generate-crypto-vector.mjs  # 生成 E2EE 跨端测试向量（Web 侧）
│   └── verify-crypto-interop.mjs   # 校验 iOS 产生的密文能被 Web 解密
├── CloudClipboard/                 # 主 App
│   ├── App/                        # 入口 / DI / 路由 / AppDelegate
│   ├── Core/
│   │   ├── Network/                # APIClient / 错误映射 / 重试 / 网络监听
│   │   ├── Security/               # Keychain / CryptoKit E2EE / Face ID
│   │   ├── Storage/                # SwiftData 离线缓存 / App Group 共享
│   │   ├── Clipboard/              # 剪贴板 / 监控 / 触感 / Deep Link
│   │   ├── Background/             # BGTaskScheduler
│   │   ├── Notifications/          # UNUserNotificationCenter
│   │   └── Spotlight/              # CoreSpotlight（默认关闭）
│   ├── Models/                     # DTO（字段名与 Worker JSON 一致）
│   ├── Services/                   # 仓库层 + SyncEngine
│   ├── Features/                   # 列表 / 详情 / 搜索 / 设置 / 引导
│   └── Components/                 # Liquid Glass / Toast / 骨架 / 状态视图
├── CloudClipboardWidget/           # WidgetKit（small / medium / large）
├── CloudClipboardShareExtension/   # Share Extension
├── CloudClipboardIntents/          # AppIntents framework（App + Extension 共用）
└── CloudClipboardTests/            # 单元测试
```

## 与后端的对接

未修改任何 Worker / Web / D1 / R2 / migrations 文件。iOS 复用的端点：

| 端点 | 用途 |
|---|---|
| `GET /api/me` | 取 `userId`（PBKDF2 盐的一半） |
| `POST /api/devices/register` | 注册设备（`device_type: "other"`，`platform: "ios"`） |
| `GET /api/clipboard?limit=200` | 列表 |
| `POST /api/clipboard` | 上传 E2EE 密文 |
| `GET/DELETE /api/clipboard/:id` | 详情（图片/文件带 `base64_content`）/ 删除 |
| `GET/PUT /api/prefs` | 主题 + 通知偏好跨设备同步 |
| `PATCH /api/devices/:id` | 重命名 / 设置 Bark 地址 |
| `GET/POST /api/tokens`、`DELETE /api/tokens/:id` | 令牌管理 |

## E2EE 兼容性（最高优先级）

算法与 `packages/crypto/src/index.ts` **逐字段一致**：

```
masterKey  = PBKDF2-SHA256(seedPhrase, "cloudclipboard:v1:" + userId, 310000, 32B)
itemKey    = 随机 32B
encrypted  = AES-256-GCM(itemKey, plaintext, iv=12B随机)      → ciphertext||tag
wrappedKey = AES-256-GCM(masterKey, itemKey, iv=salt(12B随机),
                          aad="cloudclipboard:item-key:v1")
```

该格式已用 **真实的 `packages/crypto` 代码**（Node webcrypto）双向验证：

```bash
# 1) 用 Web 端同一算法生成向量 → 已提交到 CloudClipboardTests/Resources/
node apps/ios/scripts/generate-crypto-vector.mjs
# 2) iOS 测试用它验证「Web 加密 → iOS 解密」
./scripts/test-ios.sh
# 3) iOS 写的密文再回传 Node，验证「iOS 加密 → Web 解密」
node apps/ios/scripts/verify-crypto-interop.mjs /tmp/ios-crypto-output.json
```

## 安全清单

- ✅ Token / 种子短语 / 主密钥 → **Keychain**（`AfterFirstUnlockThisDeviceOnly`）
- ✅ 本地缓存只存**密文**，明文只存在于内存 LRU（≤100 条），退到后台立即清空
- ✅ 日志统一走 `OSLog`，代码里没有任何 `print`；`AppLog` 顶部写明脱敏红线
- ✅ ATS 全开（无例外），强制 HTTPS
- ✅ Face ID：Never / Immediately / 1 分钟 / 5 分钟
- ✅ 剪贴板读取严格遵守隐私红线：只在 App active、用户主动触发或系统允许时读取，
  且先用 `changeCount` + `hasStrings` 判断，**不做后台轮询**
- ✅ Spotlight 索引默认关闭，可一键清除
- ✅ Widget 只展示**截断摘要**（≤80 字符），可关闭并立即清空
- ✅ 通知 payload 不含任何明文

## 已知限制（诚实说明）

1. **App Groups / Universal Links 需要付费账号。** 免费 Personal Team 下代码自动回退，
   Share Extension 仍可用（通过 Keychain 共享凭据）。
2. **`.xcarchive` 为 unsigned**，只用于验证流程，不能分发。
   `archive-ios.sh` 不会伪造签名，也不会声称可以分发。
3. **图片 / 文件二进制走内联摘要**：Share Extension 分享图片/文件时记录元数据与
   可读文本；完整的 R2 二进制上传（`/api/files/upload`）已在 Worker 端支持，
   但需要主 App 前台完成（Extension 时间/内存预算不足），当前版本会提示用户。
4. **推送走服务端 Bark**（现有链路保留）；iOS 侧的 `UNUserNotificationCenter`
   用于本地通知与深链跳转。APNs 接入需要付费账号的 Push 能力。
5. **动态岛 / Live Activity / visionOS** 未实现（不在需求范围内）。

## 相关文档

- `docs/ios-audit.md` — Phase 1 现状审计（真实代码结论、认证约束、API 清单）
- `docs/ios-architecture.md` — 架构、分层、系统能力落地、不变式
