//
//  AppEnvironment.swift
//  CloudClipboard
//
//  依赖容器（手写 DI，不引入第三方）。
//  所有 Repository / Service 在此组装，注入 SwiftUI Environment，
//  测试时可整体替换为 fake 实现。
//

import Foundation
import SwiftData
import SwiftUI

@MainActor
@Observable
public final class AppEnvironment {
    // 基础服务
    public let keychain: KeychainServiceProtocol
    public let crypto: CryptoServiceProtocol
    public let settings: SharedSettings
    public let networkMonitor: NetworkMonitor
    public let modelContainer: ModelContainer

    // 仓库
    public let auth: AuthRepository
    public let devices: DeviceRepository
    public let prefs: PrefsRepository
    public let clipboard: ClipboardRepository
    public let tokens: TokenRepository
    public let syncEngine: SyncEngine

    // 系统能力
    public let haptics: HapticManager
    public let clipboardMonitor: ClipboardMonitor
    public let biometricGate: BiometricGate
    public let backgroundScheduler: BackgroundTaskScheduler
    public let spotlight: SpotlightIndexing

    private let configurationStore: MutableConfigurationStore

    public init(
        configurationStore: MutableConfigurationStore = MutableConfigurationStore(),
        modelContainer: ModelContainer? = nil,
        keychain: KeychainServiceProtocol = KeychainService(service: SharedStore.keychainService),
        crypto: CryptoServiceProtocol = CryptoService(),
        settings: SharedSettings = SharedSettings(),
        spotlight: SpotlightIndexing = SpotlightIndexer()
    ) {
        self.configurationStore = configurationStore
        self.keychain = keychain
        self.crypto = crypto
        self.settings = settings
        self.spotlight = spotlight
        self.modelContainer = modelContainer ?? ModelContainerFactory.makeSharedOrInMemory()

        // 依据持久化配置初始化 API 客户端
        configurationStore.configure(
            workerURL: settings.workerURL,
            apiToken: keychain.get(.apiToken),
            accessJwt: keychain.get(.accessJwt),
            deviceId: keychain.get(.deviceId) ?? "",
            deviceName: keychain.get(.deviceName) ?? ""
        )
        let apiClient = APIClient(configurationProvider: configurationStore)

        self.networkMonitor = NetworkMonitor()
        self.haptics = HapticManager()

        let auth = AuthRepository(apiClient: apiClient, keychain: keychain, crypto: crypto, settings: settings)
        let devices = DeviceRepository(apiClient: apiClient, keychain: keychain, settings: settings)
        let prefs = PrefsRepository(apiClient: apiClient, settings: settings)
        let clipboard = ClipboardRepository(
            apiClient: apiClient,
            crypto: crypto,
            auth: auth,
            deviceRepository: devices,
            modelContainer: self.modelContainer,
            settings: settings
        )

        self.auth = auth
        self.devices = devices
        self.prefs = prefs
        self.clipboard = clipboard
        self.tokens = TokenRepository(apiClient: apiClient)
        self.clipboardMonitor = ClipboardMonitor()
        self.biometricGate = BiometricGate()
        self.backgroundScheduler = BackgroundTaskScheduler()

        self.syncEngine = SyncEngine(
            repository: clipboard,
            auth: auth,
            deviceRepository: devices,
            networkMonitor: networkMonitor,
            spotlight: spotlight,
            settings: settings
        )
    }

    /// 冷启动流程
    public func bootstrap() async {
        syncEngine.start()
        await refreshAPIConfiguration()
        await auth.bootstrap()
        guard auth.state.isReady else { return }
        await devices.registerCurrentDevice()
        await prefs.load()
        await clipboard.refresh()
        await syncEngine.reindexSpotlight()
    }

    /// 用户改设置后同步到网络层（无需重建 APIClient）
    public func refreshAPIConfiguration() async {
        configurationStore.configure(
            workerURL: settings.workerURL,
            apiToken: keychain.get(.apiToken),
            accessJwt: keychain.get(.accessJwt),
            deviceId: devices.deviceId,
            deviceName: devices.deviceName
        )
    }

    /// 退出登录：清敏感数据 + 本地缓存
    public func signOut() async {
        auth.signOut()
        clipboard.clearPlaintextCache()
        await spotlight.removeAll()
        NotificationService.shared.clearAll()
    }
}

/// 可变配置提供者：网络层通过它读到「最新」的 Worker URL / Token，
/// 避免每次改设置都要重建 APIClient。
public final class MutableConfigurationStore: APIConfigurationProviding, @unchecked Sendable {
    private let lock = NSLock()
    private var configuration: APIConfiguration = .empty

    public init() {}

    public func configure(workerURL: String, apiToken: String?, accessJwt: String? = nil, deviceId: String, deviceName: String) {
        let trimmed = workerURL.trimmingCharacters(in: .whitespacesAndNewlines)
        let url = trimmed.isEmpty ? nil : URL(string: trimmed)
        lock.lock()
        configuration = APIConfiguration(
            baseURL: url,
            apiToken: apiToken,
            accessJwt: accessJwt,
            deviceId: deviceId,
            deviceName: deviceName
        )
        lock.unlock()
    }

    public func currentConfiguration() -> APIConfiguration {
        lock.lock()
        defer { lock.unlock() }
        return configuration
    }
}

// MARK: - SwiftUI Environment

private struct AppEnvironmentKey: EnvironmentKey {
    // EnvironmentKey 要求提供一个非隔离的默认值；真正的环境实例由
    // CloudClipboardApp 通过 `.environment(environment)` 注入，这里只在
    // SwiftUI Preview / 单元测试等「未注入」场景兜底。
    //
    // 静态存储保证：即使多个 View 同时读取，也只构造一次 AppEnvironment
    // （避免重复创建 SwiftData 容器）。
    @MainActor static let fallback = AppEnvironment()

    static var defaultValue: AppEnvironment {
        MainActor.assumeIsolated { fallback }
    }
}

public extension EnvironmentValues {
    var appEnvironment: AppEnvironment {
        get { self[AppEnvironmentKey.self] }
        set { self[AppEnvironmentKey.self] = newValue }
    }
}
