//
//  ClipboardIntents.swift
//  CloudClipboardIntents
//
//  AppIntents + Shortcuts。
//
//  为什么单独编成一个 framework：
//    Widget Extension 与 Share Extension 都不能依赖主 App target 的代码，
//    但两者都需要暴露 App Intent。放在独立 framework 里两边都能链接。
//
//  注意：Intent 内部**不直接访问网络**，而是通过 App Group 里的共享指令通道
//  （SharedCommandBridge）把意图交给主 App / Widget 执行，避免在 Extension 中
//  重复实现加密与同步逻辑（也避免明文出现在 Extension 进程）。
//

import AppIntents
import Foundation

// MARK: - 实体

public struct ClipboardEntity: AppEntity, Identifiable, Sendable {
    public static var typeDisplayRepresentation: TypeDisplayRepresentation = "剪贴板记录"
    public static var defaultQuery = ClipboardEntityQuery()

    public let id: String
    public let title: String
    public let createdAt: Date

    public init(id: String, title: String, createdAt: Date) {
        self.id = id
        self.title = title
        self.createdAt = createdAt
    }

    public var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(
            title: "\(title)",
            subtitle: "\(createdAt.formatted(date: .abbreviated, time: .shortened))"
        )
    }
}

public struct ClipboardEntityQuery: EntityQuery {
    public init() {}

    public func entities(for identifiers: [String]) async throws -> [ClipboardEntity] {
        SharedCommandBridge.shared.cachedEntities().filter { identifiers.contains($0.id) }
    }

    public func suggestedEntities() async throws -> [ClipboardEntity] {
        Array(SharedCommandBridge.shared.cachedEntities().prefix(10))
    }
}

// MARK: - 枚举

public enum ClipboardListItemType: String, AppEnum {
    case text, url, code, image, file

    public static var typeDisplayRepresentation: TypeDisplayRepresentation = "内容类型"
    public static var caseDisplayRepresentations: [ClipboardListItemType: DisplayRepresentation] = [
        .text: "文本",
        .url: "链接",
        .code: "代码",
        .image: "图片",
        .file: "文件",
    ]
}

// MARK: - Intents

/// 保存当前系统剪贴板到 CloudClipboard
public struct SaveClipboardIntent: AppIntent {
    public static var title: LocalizedStringResource = "保存当前剪贴板"
    public static var description = IntentDescription("把系统剪贴板内容加密后上传到 CloudClipboard。")
    public static var openAppWhenRun: Bool = false

    @Parameter(title: "内容", description: "留空则使用系统剪贴板")
    public var content: String?

    public init() {}

    public init(content: String? = nil) {
        self.content = content
    }

    public func perform() async throws -> some IntentResult & ProvidesDialog {
        let payload = content ?? SharedCommandBridge.shared.readSystemClipboard()
        guard let payload, !payload.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return .result(dialog: "系统剪贴板是空的。")
        }
        SharedCommandBridge.shared.enqueue(.save(content: payload))
        let ok = await ClipboardIntentWorker.shared.save(content: payload)
        return .result(dialog: IntentDialog(ok ? "已保存到 CloudClipboard。" : "已保存到本地，联网后会自动上传。"))
    }
}

/// 获取最新一条剪贴板内容
public struct GetLatestClipboardIntent: AppIntent {
    public static var title: LocalizedStringResource = "获取最新剪贴板"
    public static var description = IntentDescription("读取 CloudClipboard 中最新的一条内容。")
    public static var openAppWhenRun: Bool = false

    public init() {}

    public func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        guard let text = await ClipboardIntentWorker.shared.latestPlaintext() else {
            throw ClipboardIntentError.noContent
        }
        return .result(value: text, dialog: "已获取最新剪贴板内容。")
    }
}

/// 复制最新内容到系统剪贴板
public struct CopyLatestClipboardIntent: AppIntent {
    public static var title: LocalizedStringResource = "复制最新剪贴板"
    public static var description = IntentDescription("把最新一条 CloudClipboard 内容复制到系统剪贴板。")
    public static var openAppWhenRun: Bool = false

    public init() {}

    public func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let text = await ClipboardIntentWorker.shared.latestPlaintext() else {
            throw ClipboardIntentError.noContent
        }
        SharedCommandBridge.shared.writeSystemClipboard(text)
        return .result(dialog: "已复制最新内容到剪贴板。")
    }
}

/// 搜索剪贴板
public struct SearchClipboardIntent: AppIntent {
    public static var title: LocalizedStringResource = "搜索剪贴板"
    public static var description = IntentDescription("在 CloudClipboard 中按关键词搜索。")
    public static var openAppWhenRun: Bool = false

    @Parameter(title: "关键词")
    public var query: String

    public static var parameterSummary: some ParameterSummary {
        Summary("搜索 \(\.$query)")
    }

    public init() {}

    public init(query: String) {
        self.query = query
    }

    public func perform() async throws -> some IntentResult & ReturnsValue<[ClipboardEntity]> & ProvidesDialog {
        let results = await ClipboardIntentWorker.shared.search(query: query)
        guard !results.isEmpty else {
            return .result(value: [], dialog: "没有找到匹配的内容。")
        }
        return .result(value: results, dialog: "找到 \(results.count) 条结果。")
    }
}

/// 打开指定剪贴板
public struct OpenClipboardIntent: AppIntent {
    public static var title: LocalizedStringResource = "打开剪贴板记录"
    public static var description = IntentDescription("在 App 中打开指定的剪贴板记录。")
    public static var openAppWhenRun: Bool = true

    @Parameter(title: "记录")
    public var target: ClipboardEntity

    public static var parameterSummary: some ParameterSummary {
        Summary("打开 \(\.$target)")
    }

    public init() {}

    public init(target: ClipboardEntity) {
        self.target = target
    }

    @MainActor
    public func perform() async throws -> some IntentResult & ProvidesDialog {
        SharedCommandBridge.shared.enqueue(.open(id: target.id))
        return .result(dialog: "正在打开…")
    }
}

/// 删除剪贴板（需要通过主 App 完成网络调用）
public struct DeleteClipboardIntent: AppIntent {
    public static var title: LocalizedStringResource = "删除剪贴板"
    public static var description = IntentDescription("删除一条 CloudClipboard 记录。")
    public static var openAppWhenRun: Bool = false

    @Parameter(title: "记录")
    public var target: ClipboardEntity

    public static var parameterSummary: some ParameterSummary {
        Summary("删除 \(\.$target)")
    }

    public init() {}

    public init(target: ClipboardEntity) {
        self.target = target
    }

    public func perform() async throws -> some IntentResult & ProvidesDialog {
        SharedCommandBridge.shared.enqueue(.delete(id: target.id))
        let ok = await ClipboardIntentWorker.shared.delete(id: target.id)
        return .result(dialog: IntentDialog(ok ? "已删除。" : "已标记删除，联网后生效。"))
    }
}

// MARK: - 错误

public enum ClipboardIntentError: Error, CustomLocalizedStringResourceConvertible {
    case noContent
    case networkUnavailable

    public var localizedStringResource: LocalizedStringResource {
        switch self {
        case .noContent: return "没有可用的剪贴板内容。"
        case .networkUnavailable: return "网络不可用，请稍后再试。"
        }
    }
}
