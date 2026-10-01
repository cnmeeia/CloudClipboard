//
//  AppRouter.swift
//  CloudClipboard
//
//  NavigationStack 路由状态。
//  承载 Deep Link / Universal Link / 通知 / Quick Action / Widget 的跳转。
//

import Foundation
import Observation
import SwiftUI

public enum AppTab: String, Hashable, CaseIterable {
    case clipboard
    case search
    case devices
    case settings

    public var title: String {
        switch self {
        case .clipboard: return "剪贴板"
        case .search: return "搜索"
        case .devices: return "设备"
        case .settings: return "设置"
        }
    }

    public var systemImage: String {
        switch self {
        case .clipboard: return "doc.on.clipboard"
        case .search: return "magnifyingglass"
        case .devices: return "laptopcomputer.and.iphone"
        case .settings: return "gearshape"
        }
    }
}

@MainActor
@Observable
public final class AppRouter {
    public var selectedTab: AppTab = .clipboard
    public var clipboardPath: [AppRoute] = []
    public var isPresentingCommandPalette = false
    public var searchQuery: String = ""
    /// 待上传的分享内容（Share Extension / Shortcuts / Quick Action 触发）
    public var pendingShareText: String?

    public init() {}

    /// 统一入口：处理来自任意来源的路由
    public func handle(_ route: AppRoute) {
        switch route {
        case .clipboardList:
            selectedTab = .clipboard
            clipboardPath.removeAll()
        case .clipboardDetail(let id):
            selectedTab = .clipboard
            clipboardPath = [.clipboardDetail(id: id)]
        case .search(let query):
            selectedTab = .search
            searchQuery = query ?? ""
        case .newClipboard:
            selectedTab = .clipboard
            isPresentingCommandPalette = true
        case .settings:
            selectedTab = .settings
        case .devices:
            selectedTab = .devices
        }
    }

    public func handle(url: URL) {
        guard let route = DeepLinkRouter.route(for: url) else { return }
        handle(route)
    }
}
