//
//  CloudClipboardApp.swift
//  CloudClipboard
//
//  App 入口。SwiftUI + Swift Concurrency + Observation。
//  iPad / macOS 扩展预留：所有布局基于 size class，未硬编码 iPhone 尺寸。
//

import SwiftUI
import SwiftData

@main
struct CloudClipboardApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @Environment(\.scenePhase) private var scenePhase

    @State private var environment = AppEnvironment()
    @State private var router = AppRouter()
    @State private var isLocked = false

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(environment)
                .environment(router)
                .environment(environment.prefs)
                .preferredColorScheme(environment.prefs.colorScheme)
                .task {
                    AppDelegate.routeHandler = { [router] route in
                        Task { @MainActor in router.handle(route) }
                    }
                    NotificationService.shared.configure()
                    NotificationService.shared.onRoute = { [router] route in
                        Task { @MainActor in router.handle(route) }
                    }
                    environment.backgroundScheduler.register()
                    // 后台任务回调：SyncEngine 是 @MainActor 的，因此显式跳主 actor
                    BackgroundTaskScheduler.refreshHandler = { [environment] in
                        await environment.syncEngine.backgroundRefresh()
                    }
                    BackgroundTaskScheduler.processingHandler = { [environment] in
                        let refreshed = await environment.syncEngine.backgroundRefresh()
                        await environment.syncEngine.reindexSpotlight()
                        return refreshed
                    }
                    environment.backgroundScheduler.scheduleNextRefresh()
                    environment.backgroundScheduler.scheduleProcessing()
                    await environment.bootstrap()
                    await applyBiometricPolicy(onLaunch: true)
                }
                .onOpenURL { url in
                    router.handle(url: url)
                }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    guard let url = activity.webpageURL else { return }
                    router.handle(url: url)
                }
                .onChange(of: scenePhase) { _, phase in
                    Task { await handleScenePhase(phase) }
                }
                .overlay {
                    if isLocked {
                        LockedOverlayView {
                            Task { await unlock() }
                        }
                    }
                }
        }
        .modelContainer(environment.modelContainer)
    }

    // MARK: 生命周期

    private func handleScenePhase(_ phase: ScenePhase) async {
        switch phase {
        case .active:
            if databaseLockNeeded() {
                isLocked = true
            }
            environment.clipboardMonitor.updateAppActive(true)
            environment.syncEngine.appDidBecomeActive()
            await environment.syncEngine.reindexSpotlight()
        case .inactive:
            // 进入非活跃立即清明文缓存（后台快照不含明文）
            environment.clipboard.clearPlaintextCache()
        case .background:
            environment.clipboardMonitor.updateAppActive(false)
            environment.clipboard.clearPlaintextCache()
            environment.syncEngine.appDidEnterBackground()
            environment.backgroundScheduler.scheduleNextRefresh()
            environment.backgroundScheduler.scheduleProcessing()
        @unknown default:
            break
        }
    }

    /// 是否需要展示锁屏（按用户选择的策略与离开时长）
    private func databaseLockNeeded() -> Bool {
        let policy = environment.settings.biometricPolicy
        guard policy != .never, environment.biometricGate.isAvailable else { return false }
        return environment.biometricGate.needsAuth(policy: policy) && !isLocked
    }

    private func applyBiometricPolicy(onLaunch: Bool) async {
        let policy = environment.settings.biometricPolicy
        guard policy != .never, environment.biometricGate.isAvailable else { return }
        if onLaunch, policy == .immediately {
            await unlock()
        } else {
            environment.biometricGate.markUnlocked()
        }
    }

    private func unlock() async {
        let policy = environment.settings.biometricPolicy
        do {
            let ok = try await environment.biometricGate.authenticate(reason: "解锁 CloudClipboard", policy: policy)
            if ok { isLocked = false }
        } catch {
            // 认证失败：保持锁定，等待用户再次尝试
            AppLog.security.info("生物识别解锁未通过")
        }
    }
}
