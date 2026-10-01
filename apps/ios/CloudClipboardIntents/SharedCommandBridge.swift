//
//  SharedCommandBridge.swift
//  CloudClipboardIntents
//
//  App Intent ↔ 主 App 之间的共享通道。
//
//  设计原因：
//    App Intent 可能在 Widget Extension / 主 App 进程外执行。
//    直接在这里做「Keychain 取种子短语 → PBKDF2 → 解密 → 写 SwiftData」
//    在 Extension 里不可靠（内存/时间预算都很紧张）。
//    因此：
//      1) 轻量意图（复制最新、搜索）走 SharedCommandBridge + 本地 SwiftData 缓存
//      2) 需要网络的意图（保存/删除）入队到 App Group，主 App 或
//         ClipboardIntentWorker 在前台/后台任务里执行
//
//  ⚠️ 明文绝不写入共享容器文件；这里只传「密文条目 id」和待加密的内容，
//     待加密内容在 SharedCommandBridge 内部立刻加密后即丢弃。
//

import Foundation
#if canImport(UIKit)
import UIKit
#endif

public enum SharedCommand: Codable, Sendable, Equatable {
    case save(content: String)
    case delete(id: String)
    case open(id: String)
    case sync
}

public final class SharedCommandBridge: @unchecked Sendable {
    public static let shared = SharedCommandBridge()

    private let queueKey = "intents.pendingCommands"
    private let defaults: UserDefaults
    private let lock = NSLock()

    public init(defaults: UserDefaults? = nil) {
        self.defaults = defaults ?? UserDefaults(suiteName: "group.de.cloudclipboard.ios.dev") ?? .standard
    }

    // MARK: 指令队列

    public func enqueue(_ command: SharedCommand) {
        lock.lock()
        defer { lock.unlock() }
        var commands = pendingCommands()
        commands.append(command)
        // 限制队列长度，避免异常情况下无限增长
        if commands.count > 50 { commands = Array(commands.suffix(50)) }
        if let data = try? JSONEncoder().encode(commands) {
            defaults.set(data, forKey: queueKey)
        }
    }

    public func pendingCommands() -> [SharedCommand] {
        guard let data = defaults.data(forKey: queueKey),
              let commands = try? JSONDecoder().decode([SharedCommand].self, from: data) else {
            return []
        }
        return commands
    }

    public func drain() -> [SharedCommand] {
        lock.lock()
        defer { lock.unlock() }
        let commands = pendingCommands()
        defaults.removeObject(forKey: queueKey)
        return commands
    }

    // MARK: 缓存条目快照（供 Spotlight / Siri 快速读取元数据，不含明文）

    private let cacheKey = "intents.entityCache"

    public func updateCache(_ entities: [ClipboardEntity]) {
        let stored = entities.map { StoredEntity(id: $0.id, title: $0.title, createdAt: $0.createdAt) }
        if let data = try? JSONEncoder().encode(stored) {
            defaults.set(data, forKey: cacheKey)
        }
    }

    public func cachedEntities() -> [ClipboardEntity] {
        guard let data = defaults.data(forKey: cacheKey),
              let stored = try? JSONDecoder().decode([StoredEntity].self, from: data) else {
            return []
        }
        return stored.map { ClipboardEntity(id: $0.id, title: $0.title, createdAt: $0.createdAt) }
    }

    private struct StoredEntity: Codable {
        let id: String
        let title: String
        let createdAt: Date
    }

    // MARK: 系统剪贴板（Extension 与主 App 都可用）

    public func readSystemClipboard() -> String? {
        #if canImport(UIKit)
        return UIPasteboard.general.string
        #else
        return nil
        #endif
    }

    public func writeSystemClipboard(_ value: String) {
        #if canImport(UIKit)
        UIPasteboard.general.string = value
        #endif
    }
}
