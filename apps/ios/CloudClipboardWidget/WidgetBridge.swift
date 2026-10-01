//
//  WidgetBridge.swift
//  CloudClipboardWidget
//
//  Widget 与主 App 之间的数据桥。
//  主 App 在同步完成后调用 `WidgetBridge.publish(_:)` 刷新时间线与数据。
//

import Foundation
import WidgetKit

// 本文件同时编入主 App 与 Widget target：
//   - Widget 侧用它读取 App Group 数据
//   - 主 App 侧用它发布摘要并刷新时间线

public enum WidgetBridge {
    private static let key = "shared.widgetItems"
    private static let enabledKey = "shared.widgetShowsContent"
    private static let kind = "CloudClipboardWidget"

    public static var showsContent: Bool {
        get {
            let defaults = UserDefaults(suiteName: "group.de.cloudclipboard.ios.dev") ?? .standard
            // 默认开启（用户可在设置里关闭）
            if defaults.object(forKey: enabledKey) == nil { return true }
            return defaults.bool(forKey: enabledKey)
        }
        set {
            let defaults = UserDefaults(suiteName: "group.de.cloudclipboard.ios.dev") ?? .standard
            defaults.set(newValue, forKey: enabledKey)
            if !newValue { clear() }
            reload()
        }
    }

    /// 发布摘要（最多 6 条，每条 ≤ 80 字符）
    public static func publish(_ items: [WidgetItem]) {
        guard showsContent else {
            clear()
            return
        }
        let defaults = UserDefaults(suiteName: "group.de.cloudclipboard.ios.dev") ?? .standard
        let trimmed = items.prefix(6).map { item in
            WidgetItem(
                id: item.id,
                title: String(item.title.prefix(80)),
                subtitle: item.subtitle,
                typeSystemImage: item.typeSystemImage
            )
        }
        if let data = try? JSONEncoder().encode(Array(trimmed)) {
            defaults.set(data, forKey: key)
        }
        reload()
    }

    public static func clear() {
        let defaults = UserDefaults(suiteName: "group.de.cloudclipboard.ios.dev") ?? .standard
        defaults.removeObject(forKey: key)
        reload()
    }

    public static func reload() {
        WidgetCenter.shared.reloadTimelines(ofKind: kind)
    }
}
