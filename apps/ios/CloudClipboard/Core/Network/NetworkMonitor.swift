//
//  NetworkMonitor.swift
//  CloudClipboard
//
//  网络可达性监听（NWPathMonitor）。
//  用途：离线状态 UI 提示 + 网络恢复时触发 outbox 重放。
//

import Foundation
import Network
import Observation

@MainActor
@Observable
public final class NetworkMonitor {
    public private(set) var isOnline: Bool = true
    public private(set) var isExpensive: Bool = false
    public private(set) var isConstrained: Bool = false

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "de.cloudclipboard.networkmonitor")
    private var onBecameOnline: [@Sendable () -> Void] = []

    public init() {}

    public func start() {
        monitor.pathUpdateHandler = { [weak self] path in
            // 注意：这个回调在 NWPathMonitor 的私有队列上执行，
            // 因此所有状态读写都跳回主 actor，避免与 @Observable 产生数据竞争。
            let online = path.status == .satisfied
            let expensive = path.isExpensive
            let constrained = path.isConstrained
            Task { @MainActor [weak self] in
                guard let self else { return }
                let wasOffline = !self.isOnline
                self.isOnline = online
                self.isExpensive = expensive
                self.isConstrained = constrained
                if online && wasOffline {
                    for handler in self.onBecameOnline { handler() }
                }
            }
        }
        monitor.start(queue: queue)
    }

    public func stop() {
        monitor.cancel()
    }

    /// 注册「网络恢复」回调（例如触发 SyncEngine.flushOutbox）
    public func whenOnline(_ handler: @escaping @Sendable () -> Void) {
        onBecameOnline.append(handler)
    }
}
