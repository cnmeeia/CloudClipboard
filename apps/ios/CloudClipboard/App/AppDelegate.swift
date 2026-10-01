//
//  AppDelegate.swift
//  CloudClipboard
//
//  UIKit 侧能力：
//    - Quick Actions（长按 App 图标）
//    - 推送注册
//    - 通知点击
//

import Foundation
import UIKit

public enum QuickAction: String, CaseIterable {
    case newClipboard = "de.cloudclipboard.ios.dev.quickaction.new"
    case search = "de.cloudclipboard.ios.dev.quickaction.search"
    case latest = "de.cloudclipboard.ios.dev.quickaction.latest"
    case settings = "de.cloudclipboard.ios.dev.quickaction.settings"

    public var title: String {
        switch self {
        case .newClipboard: return "新建剪贴板"
        case .search: return "搜索剪贴板"
        case .latest: return "最新剪贴板"
        case .settings: return "设置"
        }
    }

    public var subtitle: String {
        switch self {
        case .newClipboard: return "上传当前系统剪贴板"
        case .search: return "在 CloudClipboard 中搜索"
        case .latest: return "打开最新一条记录"
        case .settings: return "打开设置"
        }
    }

    public var systemImage: String {
        switch self {
        case .newClipboard: return "plus.circle"
        case .search: return "magnifyingglass"
        case .latest: return "clock"
        case .settings: return "gearshape"
        }
    }

    public var route: AppRoute {
        switch self {
        case .newClipboard: return .newClipboard
        case .search: return .search(query: nil)
        case .latest: return .clipboardList
        case .settings: return .settings
        }
    }
}

/// Quick Actions 由 Info.plist 的 UIApplicationShortcutItems 静态声明，
/// 这里提供运行时兜底注册（若静态声明被裁剪，仍保证可用）。
public func registerQuickActions(on application: UIApplication) {
    let existing = Set(application.shortcutItems?.compactMap { $0.type } ?? [])
    guard existing.isEmpty else { return }

    application.shortcutItems = QuickAction.allCases.map { action in
        UIApplicationShortcutItem(
            type: action.rawValue,
            localizedTitle: action.title,
            localizedSubtitle: action.subtitle,
            icon: UIApplicationShortcutIcon(systemImageName: action.systemImage)
        )
    }
}

public func routeForQuickAction(_ item: UIApplicationShortcutItem) -> AppRoute? {
    QuickAction(rawValue: item.type)?.route
}

@MainActor
public final class AppDelegate: NSObject, UIApplicationDelegate {
    /// 由 App 注入：处理 Quick Action / 推送跳转
    public static var routeHandler: ((AppRoute) -> Void)?
    public static var notificationTokenHandler: ((Data) -> Void)?

    public func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        registerQuickActions(on: application)
        return true
    }

    public func application(
        _ application: UIApplication,
        performActionFor shortcutItem: UIApplicationShortcutItem,
        completionHandler: @escaping (Bool) -> Void
    ) {
        guard let route = routeForQuickAction(shortcutItem) else {
            completionHandler(false)
            return
        }
        Self.routeHandler?(route)
        completionHandler(true)
    }

    public func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Self.notificationTokenHandler?(deviceToken)
    }

    public func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        AppLog.security.info("APNs 注册失败: \(error.localizedDescription, privacy: .public)")
    }
}
