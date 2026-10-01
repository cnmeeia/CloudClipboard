# CloudClipboard iOS 原生客户端 — 架构

## 0. 定位

把 CloudClipboard 从 PWA 升级为**真正原生**的 iOS App，同时**零改动**复用现有
Cloudflare Worker / D1 / R2 / E2EE 后端。Web App 与 Worker 代码在本分支中**未做任何修改**。

- 不用 WKWebView 作为主 UI（仓库中不存在任何 WebView 引用）
- 认证：API Token（`Authorization: Bearer cca_...`，见 `docs/ios-audit.md` §2）
- 加密：CryptoKit 1:1 复刻 `packages/crypto`（AES-256-GCM + PBKDF2 310k）

## 1. 分层

```
SwiftUI (Features/)
   │  @Observable stores, async/await
   ▼
Domain (Models/ + Services/)
   │  纯值类型 + 用例，不依赖 UIKit/网络细节
   ▼
Data (Core/Network, Core/Security, Core/Storage, Core/Clipboard)
   │  APIClient(URLSession) / KeychainService / CryptoService / SwiftData
   ▼
CloudClipboard Worker API
   │
   ├── D1 (元数据 + 密文)
   └── R2 (文件/图片)
```

依赖方向单向向下，`Features` 只依赖 `Services` 协议，便于测试注入 fake。

## 2. 目录结构（真实）

```
apps/ios/
├── project.yml                    # XcodeGen 工程定义（单一事实来源）
├── project.pbxproj.generated-hint # 说明文件
├── CloudClipboard/
│   ├── App/            CloudClipboardApp / AppRouter / AppEnvironment / AppDelegate
│   ├── Core/
│   │   ├── Network/    APIClient / APIError / RetryPolicy / NetworkMonitor / Endpoints
│   │   ├── Security/   KeychainService / CryptoService / Base64URL / BiometricGate
│   │   ├── Storage/    ModelContainer / CachedClipboardItem(SwiftData) / AppGroupDefaults
│   │   ├── Clipboard/  ClipboardService / ClipboardMonitor / HapticManager / DeepLinkRouter
│   │   ├── Background/ BackgroundTaskScheduler
│   │   ├── Notifications/ NotificationService
│   │   ├── Spotlight/  SpotlightIndexer
│   │   └── Extensions/ Date+/Motion+/Log+
│   ├── Models/         ClipboardItem / Device / UserPrefs / ClipboardType
│   ├── Services/       ClipboardRepository / AuthRepository / DeviceRepository / PrefsRepository / SyncEngine
│   ├── Features/
│   │   ├── Clipboard/  ClipboardListView / ClipboardRow / CommandPalette
│   │   ├── Detail/     ClipboardDetailView
│   │   ├── Search/     SearchView
│   │   ├── Settings/   SettingsView / DevicesView / AppearanceView / SecurityView / AboutView
│   │   └── Authentication/ SetupView (API Token + 种子短语)
│   ├── Components/     Toast / Skeleton / EmptyState / ErrorState / GlassCard / PrimaryButton
│   └── Resources/      Assets.xcassets / Info.plist / CloudClipboard.entitlements
├── CloudClipboardWidget/           WidgetKit（systemSmall/Medium/Large）
├── CloudClipboardShareExtension/   Share Extension（URL/Text/Image/File）
├── CloudClipboardIntents/          AppIntents + AppShortcuts（主 App 与 Widget 共用）
└── CloudClipboardTests/            Unit + Crypto 互通测试
```

> 说明：本仓库不含 `CloudClipboardUITests`（UI 测试需真机/模拟器，CI 环境无签名，故不纳入），
> Deep Link / Widget / Share Extension 的行为以单元测试覆盖路由解析与 payload 构造。

## 3. 关键设计决策

### 3.1 认证与身份
- Worker 的 `userId` 由 Access 邮箱派生后**固化在 api_tokens 行**里，iOS 用 Token 拿到的
  `userId` 与 Web 完全一致 → PBKDF2 盐一致 → **master key 一致** → 密文互通。
- Token 存 Keychain（`kSecClassGenericPassword`, service `de.cloudclipboard.credentials`）。
- `GET /api/me` 返回的 `user.id` 会与本地缓存比对，不一致直接报错（防止换账号后解密失败难排查）。

### 3.2 加密
- PBKDF2 用 `CommonCrypto.CCKeyDerivationPBKDF`（iOS 无原生 PBKDF2）。
- `AES.GCM.seal(_:using:nonce:)` 输出 `ciphertext + tag` 拼接，正好等于 WebCrypto 的
  `encrypt()` 输出格式（ciphertext||tag），因此**无需重排字节**。
- wrappedKey 用 `AES.GCM.seal(..., authenticating: AAD)`，AAD = `cloudclipboard:item-key:v1`。

### 3.3 离线优先
- SwiftData 本地表 `CachedClipboardItem`：`id/ciphertext/iv/salt/wrappedKey/type/createdAt/expiresAt/syncState`。
- `SyncState`: `synced | pending | failed | deleted`。
- 上传走 `OutboxEntry`：先写本地 `pending`，再尝试网络；`SyncEngine` 在网络恢复（`NWPathMonitor`）
  或 `BGAppRefreshTask` 时重放。
- **离线时不缓存明文**。列表解密按需进行（内存 LRU，最多 100 条），列表落盘只存密文。
- Spotlight 索引默认关闭（敏感内容），开启后仅索引**已解密文本的前 120 字符**且可随时清除。

### 3.4 前台/后台
- 前台：`SyncScheduler` 30s 轮询（与 Web 的 `CLIPBOARD_POLL_INTERVAL_MS` 一致）+ `scenePhase` 触发。
- 后台：`BGAppRefreshTask`（`de.cloudclipboard.refresh`）+ `BGProcessingTask`（同步 outbox）。
  遵守 iOS 后台限制，不做常驻轮询。

### 3.5 Liquid Glass
- iOS 26+ 使用系统原生玻璃材质；通过 `GlassSurface` 组件用 `#available` 分派：
  - iOS 26+：`.glassEffect()` / `.glassEffectID()` / `GlassEffectContainer` 原生 API
  - iOS 17–25：`.ultraThinMaterial` + `contentTransition` 回退
- 覆盖 TabBar / Toolbar / FAB / Sheet / ContextMenu / Widget。

### 3.6 iOS 16/17/18 兼容
- Deployment Target：**iOS 17.0**（Observation / SwiftData / AppIntents 均需 ≥17）
- iOS 26 专属 API 一律 `if #available(iOS 26.0, *)` 包裹并带 fallback。
- `Info.plist` 声明 `UIDesignRequiresCompatibility = YES`，使 iOS 26 上仍使用稳定布局。

## 4. 系统能力落地

| 能力 | 实现位置 | 说明 |
|---|---|---|
| Share Extension | `CloudClipboardShareExtension/` | App Group 共享 Token 与 outbox；文本/URL/图片/文件 |
| WidgetKit | `CloudClipboardWidget/` | small 1 条 / medium 3 条 / large 6 条；tile 点击走 `cloudclipboard://clipboard/{id}` |
| App Intents / Shortcuts | `CloudClipboardIntents/` | `SaveClipboardIntent` / `GetLatestClipboardIntent` / `SearchClipboardIntent` / `CopyClipboardIntent` / `DeleteClipboardIntent` + `AppShortcutsProvider` |
| Quick Actions | `AppDelegate` + `Info.plist` `UIApplicationShortcutItems` | 新建 / 搜索 / 最新 / 设置 |
| Universal Links | `CloudClipboard.entitlements` + `apple-app-site-association` 示例 | `https://clip.0272.de5.net/c/{id}` |
| Custom URL Scheme | `Info.plist` `CFBundleURLSchemes = cloudclipboard` | `cloudclipboard://clipboard/{id}` |
| Face ID | `BiometricGate` (LocalAuthentication) | Never / Immediately / 1min / 5min，保护明文与密钥访问 |
| Keychain | `KeychainService` | Token / 种子短语 / 加密 key / deviceID / userID |
| Spotlight | `SpotlightIndexer` (CoreSpotlight) | 可开关，默认关闭 |
| Push | `NotificationService` (UNUserNotificationCenter) | payload **不含明文**；点击走 Deep Link |
| BackgroundTasks | `BackgroundTaskScheduler` | refresh + processing |
| Haptics | `HapticManager` | success/warning/error/selection/light/medium/heavy |

## 5. 与后端的数据流

```
iOS 上传：
  UIPasteboard/ShareExt → CryptoService.encryptClipboardContent(plaintext, masterKey)
    → POST /api/clipboard {type, encrypted_data, iv, salt, wrapped_key, size, expires_in}
    → 本地写入 SwiftData(syncState = synced 或 pending)

iOS 拉取：
  GET /api/clipboard?limit=200 → [ClipboardItemDTO]
    → 密文落 SwiftData → CryptoService.decryptClipboardContent(masterKey)
    → ViewModel 内存解密缓存 → UI
```

## 6. 不变式（Invariants）

1. 明文绝不离开设备（除 `plain=1` 的历史记录与显式明文上传）。
2. 明文绝不写日志（`Log.swift` 统一脱敏，禁止直接 `print`）。
3. Token / 种子短语 / key 只落 Keychain，绝不写 `UserDefaults`。
4. 不修改 `apps/web`、`apps/worker`、`packages/*`、`migrations/*`。
5. 所有网络请求 HTTPS（ATS 默认 + 域名白名单为空）。
