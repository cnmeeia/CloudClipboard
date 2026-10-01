//
//  WidgetPayload.swift
//  CloudClipboardWidget
//
//  Widget 与主 App 共享的数据类型（编进两个 target）。
//  单独成文件，避免主 App 为了写摘要而把整个 WidgetKit entry point 也编进来。
//

import Foundation

/// Widget 里展示的一条摘要。
/// ⚠️ 这里存的是**截断后的文本**，不是完整明文。
/// 是否写入由用户在「设置 → 隐私」中的开关控制，默认开启但可一键关闭并清除。
public struct WidgetItem: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let subtitle: String
    /// SF Symbol 名（由主 App 依据类型映射）
    public let typeSystemImage: String

    public init(id: String, title: String, subtitle: String, typeSystemImage: String) {
        self.id = id
        self.title = title
        self.subtitle = subtitle
        self.typeSystemImage = typeSystemImage
    }

    /// Deep Link：cloudclipboard://clipboard/{id}
    public var deepLink: URL? {
        URL(string: "cloudclipboard://clipboard/\(id)")
    }
}

public enum WidgetItemMapper {
    /// 单个标题的最大长度（写入 App Group 前截断）
    public static let maxTitleLength = 80

    public static func systemImage(for type: String) -> String {
        switch type {
        case "url": return "link"
        case "code": return "chevron.left.forwardslash.chevron.right"
        case "image": return "photo"
        case "file": return "doc"
        default: return "text.alignleft"
        }
    }
}
