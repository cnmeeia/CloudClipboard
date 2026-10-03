//
//  ModelContainerFactory.swift
//  CloudClipboard
//
//  SwiftData 容器构造。主 App / Widget / Share Extension 共用同一个 store 文件，
//  放在 SharedStore.containerURL（App Group 可用时即为共享容器）。
//

import Foundation
import SwiftData
import CloudClipboardShared

public enum ModelContainerFactory {
    public static let schema = Schema([CachedClipboardItem.self])

    /// 共享容器（App Group + 主 App + Extension 共用）
    public static func makeShared() throws -> ModelContainer {
        let configuration = ModelConfiguration(
            schema: schema,
            url: SharedStore.databaseURL,
            allowsSave: true,
            cloudKitDatabase: .none
        )
        return try ModelContainer(for: schema, configurations: [configuration])
    }

    /// 纯内存容器（单元测试 / SwiftUI Preview）
    public static func makeInMemory() throws -> ModelContainer {
        let configuration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        return try ModelContainer(for: schema, configurations: [configuration])
    }

    /// 失败时降级到内存容器：宁可本次会话不持久化，也不能启动即崩。
    ///
    /// 注意：内存容器的创建理论上不会失败（`isStoredInMemoryOnly: true` 不做磁盘 IO）。
    /// 若真失败（例如 Schema 与当前 SwiftData 版本不兼容），说明这是**代码/环境问题**，
    /// 继续运行只会到处崩溃 —— 此时显式终止并打印可诊断信息，比静默降级更负责任。
    public static func makeSharedOrInMemory() -> ModelContainer {
        do {
            return try makeShared()
        } catch {
            AppLog.storage.error("SwiftData 持久化容器创建失败，降级为内存容器: \(error.localizedDescription, privacy: .public)")
        }

        do {
            return try makeInMemory()
        } catch {
            // 内存容器都建不起来 → 数据层不可用，明确终止并给出可诊断信息
            AppLog.storage.fault("SwiftData 内存容器创建失败（Schema 不兼容？）: \(error.localizedDescription, privacy: .public)")
            preconditionFailure("CloudClipboard: 无法创建 SwiftData 容器，数据层不可用")
        }
    }
}
