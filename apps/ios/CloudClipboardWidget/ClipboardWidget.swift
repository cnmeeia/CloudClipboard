//
//  ClipboardWidget.swift
//  CloudClipboardWidget
//
//  WidgetKit：small（1 条）/ medium（3 条）/ large（6 条）。
//
//  数据来源：
//    主 App 在每次成功同步后，把「已解密的前 N 条摘要」写入 App Group
//    的 UserDefaults（**这是有意为之的取舍**：Widget 无法在渲染时做 PBKDF2
//    310k 次迭代，也不应在 Widget 进程持有主密钥）。
//    因此：
//      - 只有用户开启「Widget 显示内容」时才写入
//      - 写入的不是完整明文，而是截断后的摘要（≤ 80 字符）
//      - 关闭开关会立刻清空
//    如果更看重隐私，可在设置里关闭，Widget 只显示「有 N 条新内容」。
//

import WidgetKit
import SwiftUI

// MARK: - Timeline Entry

struct ClipboardEntry: TimelineEntry {
    let date: Date
    let items: [WidgetItem]
    let isConfigured: Bool

    static let placeholder = ClipboardEntry(
        date: Date(),
        items: [
            WidgetItem(id: "1", title: "Hello World", subtitle: "iPhone · 刚刚", typeSystemImage: "text.alignleft"),
            WidgetItem(id: "2", title: "https://example.com", subtitle: "MacBook · 5 分钟前", typeSystemImage: "link"),
            WidgetItem(id: "3", title: "ssh root@server", subtitle: "iPad · 1 小时前", typeSystemImage: "chevron.left.forwardslash.chevron.right"),
        ],
        isConfigured: true
    )

    static let empty = ClipboardEntry(date: Date(), items: [], isConfigured: false)
}

// MARK: - Provider

struct ClipboardProvider: TimelineProvider {
    func placeholder(in context: Context) -> ClipboardEntry {
        .placeholder
    }

    func getSnapshot(in context: Context, completion: @escaping (ClipboardEntry) -> Void) {
        completion(loadEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ClipboardEntry>) -> Void) {
        let entry = loadEntry()
        // 每 30 分钟刷新一次（与主 App 的同步节奏匹配，遵守 Widget 预算）
        let next = Date(timeIntervalSinceNow: 30 * 60)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }

    private func loadEntry() -> ClipboardEntry {
        let defaults = UserDefaults(suiteName: "group.de.cloudclipboard.ios.dev") ?? .standard
        guard let data = defaults.data(forKey: "shared.widgetItems"),
              let items = try? JSONDecoder().decode([WidgetItem].self, from: data),
              !items.isEmpty else {
            return .empty
        }
        return ClipboardEntry(date: Date(), items: items, isConfigured: true)
    }
}

// MARK: - Views

struct CloudClipboardWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    var entry: ClipboardEntry

    /// small = 1, medium = 3, large = 6
    private var limit: Int {
        switch family {
        case .systemSmall: return 1
        case .systemMedium: return 3
        default: return 6
        }
    }

    var body: some View {
        Group {
            if !entry.isConfigured {
                unconfiguredView
            } else if entry.items.isEmpty {
                emptyView
            } else {
                listView
            }
        }
        .containerBackground(for: .widget) {
            LinearGradient(
                colors: [Color.accentColor.opacity(0.16), Color(.systemBackground)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }

    private var listView: some View {
        VStack(alignment: .leading, spacing: 6) {
            header

            ForEach(entry.items.prefix(limit)) { item in
                if let url = item.deepLink {
                    Link(destination: url) {
                        row(item)
                    }
                } else {
                    row(item)
                }
            }

            Spacer(minLength: 0)
        }
        .padding(2)
    }

    private var header: some View {
        HStack(spacing: 5) {
            Image(systemName: "doc.on.clipboard.fill")
                .font(.caption2)
                .foregroundStyle(Color.accentColor)
            Text("CloudClipboard")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
            Spacer(minLength: 0)
        }
    }

    private func row(_ item: WidgetItem) -> some View {
        HStack(spacing: 6) {
            Image(systemName: item.typeSystemImage)
                .font(.caption2)
                .foregroundStyle(Color.accentColor)
                .frame(width: 14)
            VStack(alignment: .leading, spacing: 1) {
                Text(item.title)
                    .font(.caption.weight(.medium))
                    .lineLimit(1)
                Text(item.subtitle)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }

    private var unconfiguredView: some View {
        VStack(spacing: 6) {
            Image(systemName: "lock.doc")
                .font(.title3)
                .foregroundStyle(.secondary)
            Text("打开 App 完成设置")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyView: some View {
        VStack(spacing: 6) {
            Image(systemName: "doc.on.clipboard")
                .font(.title3)
                .foregroundStyle(.secondary)
            Text("暂无内容")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Widget 定义

struct CloudClipboardWidget: Widget {
    let kind = "CloudClipboardWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ClipboardProvider()) { entry in
            CloudClipboardWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("CloudClipboard")
        .description("查看最近的剪贴板内容，点按直接打开。")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

@main
struct CloudClipboardWidgetBundle: WidgetBundle {
    var body: some Widget {
        CloudClipboardWidget()
    }
}
