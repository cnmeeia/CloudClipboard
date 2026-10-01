//
//  AppShortcuts.swift
//  CloudClipboardIntents
//
//  Siri / Spotlight / 捷径（Shortcuts）可用的预置短语。
//

import AppIntents

public struct CloudClipboardShortcuts: AppShortcutsProvider {
    public static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: SaveClipboardIntent(),
            phrases: [
                "用 \(.applicationName) 保存剪贴板",
                "保存到 \(.applicationName)",
                "Save to \(.applicationName)",
            ],
            shortTitle: "保存剪贴板",
            systemImageName: "icloud.and.arrow.up"
        )

        AppShortcut(
            intent: GetLatestClipboardIntent(),
            phrases: [
                "获取 \(.applicationName) 最新剪贴板",
                "Get latest from \(.applicationName)",
            ],
            shortTitle: "获取最新剪贴板",
            systemImageName: "clock.arrow.circlepath"
        )

        AppShortcut(
            intent: CopyLatestClipboardIntent(),
            phrases: [
                "复制 \(.applicationName) 最新内容",
                "Copy latest from \(.applicationName)",
            ],
            shortTitle: "复制最新剪贴板",
            systemImageName: "doc.on.doc"
        )

        AppShortcut(
            intent: SearchClipboardIntent(),
            phrases: [
                "在 \(.applicationName) 搜索",
                "Search \(.applicationName)",
            ],
            shortTitle: "搜索剪贴板",
            systemImageName: "magnifyingglass"
        )

        AppShortcut(
            intent: OpenClipboardIntent(),
            phrases: [
                "打开 \(.applicationName) 记录",
                "Open \(.applicationName) item",
            ],
            shortTitle: "打开剪贴板记录",
            systemImageName: "arrow.up.forward.app"
        )

        AppShortcut(
            intent: DeleteClipboardIntent(),
            phrases: [
                "删除 \(.applicationName) 记录",
                "Delete \(.applicationName) item",
            ],
            shortTitle: "删除剪贴板",
            systemImageName: "trash"
        )
    }
}
