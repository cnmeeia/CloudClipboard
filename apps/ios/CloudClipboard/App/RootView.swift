//
//  RootView.swift
//  CloudClipboard
//
//  根视图：未初始化 → 引导页；就绪 → TabView。
//  原生 TabView + NavigationStack（iPhone）；iPad 走 NavigationSplitView。
//

import SwiftUI

struct RootView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(AppRouter.self) private var router
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    var body: some View {
        Group {
            switch environment.auth.state {
            case .unconfigured, .expired, .needsSeedPhrase:
                SetupView()
            case .ready:
                mainTabs
            }
        }
        .background(AppBackground())
    }

    @ViewBuilder
    private var mainTabs: some View {
        @Bindable var router = router

        if horizontalSizeClass == .regular {
            // iPad / 未来 macOS：分栏布局（预留扩展空间）
            NavigationSplitView {
                List(AppTab.allCases, id: \.self, selection: Binding(
                    get: { Optional(router.selectedTab) },
                    set: { if let value = $0 { router.selectedTab = value } }
                )) { tab in
                    Label(tab.title, systemImage: tab.systemImage)
                }
                .navigationTitle("CloudClipboard")
            } detail: {
                detailView(for: router.selectedTab)
            }
        } else {
            TabView(selection: $router.selectedTab) {
                ForEach(AppTab.allCases, id: \.self) { tab in
                    tabContent(for: tab)
                        .tabItem {
                            Label(tab.title, systemImage: tab.systemImage)
                        }
                        .tag(tab)
                        .accessibilityLabel(tab.title)
                }
            }
        }
    }

    @ViewBuilder
    private func tabContent(for tab: AppTab) -> some View {
        switch tab {
        case .clipboard:
            @Bindable var router = router
            NavigationStack(path: $router.clipboardPath) {
                ClipboardListView()
                    .navigationDestination(for: AppRoute.self) { route in
                        switch route {
                        case .clipboardDetail(let id):
                            ClipboardDetailView(itemID: id)
                        default:
                            ClipboardListView()
                        }
                    }
            }
        case .search:
            NavigationStack { SearchView() }
        case .devices:
            NavigationStack { DevicesView() }
        case .settings:
            NavigationStack { SettingsView() }
        }
    }

    @ViewBuilder
    private func detailView(for tab: AppTab) -> some View {
        switch tab {
        case .clipboard: ClipboardListView()
        case .search: SearchView()
        case .devices: DevicesView()
        case .settings: SettingsView()
        }
    }
}

/// 简单的品牌化背景（渐变 + 系统材质），随深浅色自适应
struct AppBackground: View {
    var body: some View {
        LinearGradient(
            colors: [
                Color.accentColor.opacity(0.10),
                Color(.systemBackground)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }
}
