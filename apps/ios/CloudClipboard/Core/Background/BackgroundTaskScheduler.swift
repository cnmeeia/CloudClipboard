//
//  BackgroundTaskScheduler.swift
//  CloudClipboard
//
//  BackgroundTasks 调度。
//
//  使用 BGAppRefreshTask 拉取新条目 / BGProcessingTask 同步 outbox。
//  严格尊重 iOS 后台限制：不申请无限后台、不做定时轮询。
//  实际触发时机由系统决定，这里只登记「想做的事」。
//

import Foundation
import BackgroundTasks
import OSLog
import CloudClipboardShared

public final class BackgroundTaskScheduler {
    public static let refreshIdentifier = "de.cloudclipboard.ios.dev.refresh"
    public static let processingIdentifier = "de.cloudclipboard.ios.dev.processing"

    /// 系统回调注入点：App 启动时注册真实的同步动作。
    /// 标记 @MainActor，因为同步逻辑（SyncEngine）是主 actor 隔离的。
    @MainActor public static var refreshHandler: (() async -> Bool)?
    @MainActor public static var processingHandler: (() async -> Bool)?

    public init() {}

    /// 必须在 didFinishLaunching 阶段调用（Info.plist 已声明 BGTaskSchedulerPermittedIdentifiers）
    public func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.refreshIdentifier, using: nil) { [weak self] task in
            guard let refreshTask = task as? BGAppRefreshTask else { return }
            self?.handleRefresh(refreshTask)
        }
        BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.processingIdentifier, using: nil) { [weak self] task in
            guard let processingTask = task as? BGProcessingTask else { return }
            self?.handleProcessing(processingTask)
        }
    }

    /// 登记下一次刷新（失败不抛，仅记录——系统可能因配额拒绝）
    public func scheduleNextRefresh(earliestAfter seconds: TimeInterval = 15 * 60) {
        let request = BGAppRefreshTaskRequest(identifier: Self.refreshIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: seconds)
        submit(request)
    }

    public func scheduleProcessing(requiresNetwork: Bool = true, earliestAfter seconds: TimeInterval = 30 * 60) {
        let request = BGProcessingTaskRequest(identifier: Self.processingIdentifier)
        request.requiresNetworkConnectivity = requiresNetwork
        request.requiresExternalPower = false
        request.earliestBeginDate = Date(timeIntervalSinceNow: seconds)
        submit(request)
    }

    public func cancelAll() {
        BGTaskScheduler.shared.cancelAllTaskRequests()
    }

    // MARK: 内部

    private func submit(_ request: BGTaskRequest) {
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            AppLog.background.info("后台任务登记失败（系统配额/能力限制）: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func handleRefresh(_ task: BGAppRefreshTask) {
        // 立刻登记下一次，形成链式调度
        scheduleNextRefresh()

        let work = Task<Bool, Never> { @MainActor in
            await Self.refreshHandler?() ?? false
        }
        task.expirationHandler = { work.cancel() }

        Task {
            let ok = await work.value
            task.setTaskCompleted(success: ok)
        }
    }

    private func handleProcessing(_ task: BGProcessingTask) {
        scheduleProcessing()

        let work = Task<Bool, Never> { @MainActor in
            await Self.processingHandler?() ?? false
        }
        task.expirationHandler = { work.cancel() }

        Task {
            let ok = await work.value
            task.setTaskCompleted(success: ok)
        }
    }
}
