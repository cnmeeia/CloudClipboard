//
//  SyncEngine.swift
//  CloudClipboard
//
//  同步编排：
//    - 前台 30s 轮询（与 Web 的 CLIPBOARD_POLL_INTERVAL_MS 一致）
//    - scenePhase 变化时立即同步一次
//    - 网络恢复时重放 outbox
//    - BGAppRefreshTask 里做一次轻量刷新 + outbox 重放
//

import Foundation
import Observation

@MainActor
@Observable
public final class SyncEngine {
    public private(set) var lastSyncAt: Date?
    public private(set) var isSyncing = false
    public private(set) var pendingCount = 0

    /// 与 packages/shared 的 CLIPBOARD_POLL_INTERVAL_MS 保持一致
    public static let pollInterval: TimeInterval = 30

    private let repository: ClipboardRepository
    private let auth: AuthRepository
    private let deviceRepository: DeviceRepository
    private let networkMonitor: NetworkMonitor
    private let spotlight: SpotlightIndexing
    private let settings: SharedSettings

    private var pollTask: Task<Void, Never>?
    private var isActive = false

    public init(
        repository: ClipboardRepository,
        auth: AuthRepository,
        deviceRepository: DeviceRepository,
        networkMonitor: NetworkMonitor,
        spotlight: SpotlightIndexing = SpotlightIndexer(),
        settings: SharedSettings = SharedSettings()
    ) {
        self.repository = repository
        self.auth = auth
        self.deviceRepository = deviceRepository
        self.networkMonitor = networkMonitor
        self.spotlight = spotlight
        self.settings = settings
    }

    // MARK: 生命周期

    public func start() {
        networkMonitor.whenOnline { [weak self] in
            Task { @MainActor in
                await self?.syncNow(reason: "网络恢复")
            }
        }
        networkMonitor.start()
    }

    public func appDidBecomeActive() {
        isActive = true
        startPolling()
        Task { await syncNow(reason: "进入前台") }
    }

    public func appDidEnterBackground() {
        isActive = false
        stopPolling()
    }

    private func startPolling() {
        stopPolling()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(Self.pollInterval * 1_000_000_000))
                guard !Task.isCancelled else { return }
                await self?.syncNow(reason: "轮询")
            }
        }
    }

    private func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    // MARK: 同步

    public func syncNow(reason: String) async {
        guard auth.state.isReady else { return }
        guard !isSyncing else { return }
        isSyncing = true
        defer { isSyncing = false }

        await deviceRepository.registerCurrentDevice()
        await repository.flushOutbox()
        await repository.refresh(showSpinner: false)

        lastSyncAt = Date()
        settings.lastSyncAt = lastSyncAt
        publishWidgetSnapshot()
        AppLog.sync.debug("同步完成（触发源: \(reason, privacy: .public)）")
    }

    /// 把最近几条的**截断摘要**写入 App Group，供 Widget 展示。
    /// 用户关闭「Widget 显示内容」时会自动清空。
    public func publishWidgetSnapshot() {
        let entries: [WidgetItem] = repository.items.prefix(6).compactMap { item in
            guard let text = repository.plaintext(for: item) else { return nil }
            let oneLine = text
                .replacingOccurrences(of: "\n", with: " ")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !oneLine.isEmpty else { return nil }
            return WidgetItem(
                id: item.id,
                title: String(oneLine.prefix(WidgetItemMapper.maxTitleLength)),
                subtitle: "\(item.deviceName) · \(ClipboardDateFormatting.relative(for: item.createdDate))",
                typeSystemImage: WidgetItemMapper.systemImage(for: item.type.rawValue)
            )
        }
        WidgetBridge.publish(entries)
    }

    /// 后台刷新：轻量，避免超出系统执行窗口
    public func backgroundRefresh() async -> Bool {
        guard auth.state.isReady else { return false }
        await repository.flushOutbox()
        await repository.refresh(showSpinner: false)
        lastSyncAt = Date()
        publishWidgetSnapshot()
        return true
    }

    // MARK: Spotlight

    public func reindexSpotlight() async {
        guard settings.spotlightEnabled else {
            await spotlight.removeAll()
            return
        }
        let entries: [SpotlightItem] = repository.items.compactMap { item in
            guard let text = repository.plaintext(for: item) else { return nil }
            let snippet = String(text.prefix(SpotlightIndexer.maxSnippetLength))
            return SpotlightItem(
                id: item.id,
                title: String(text.prefix(60)),
                snippet: snippet,
                createdAt: item.createdDate
            )
        }
        await spotlight.index(entries)
    }
}
