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
        .environment(\.font, Typography.body)
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

/// 品牌化动态背景：深色基底 + 缓慢漂浮的极光光斑。
/// Liquid Glass 世界的「景深」来源——玻璃材质需要有色彩从背后流过才成立。
/// 用 TimelineView 驱动，变换的是 CGAffineTransform（GPU 合成），
/// 不触发 SwiftUI 重新布局；开启「减弱动态效果」时退化为静态渐变。
struct AppBackground: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size

            ZStack {
                baseGradient

                if reduceMotion {
                    auroraStatic(size: size)
                } else {
                    TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: false)) { timeline in
                        let t = timeline.date.timeIntervalSinceReferenceDate
                        auroraLayer(t: t, size: size)
                    }
                }
            }
            .frame(width: size.width, height: size.height)
        }
        .ignoresSafeArea()
    }

    /// 基底：极深的冷色渐变（浅色模式下为近白冷色），承载极光
    private var baseGradient: some View {
        LinearGradient(
            colors: colorScheme == .dark
                ? [Color(red: 0.05, green: 0.06, blue: 0.09),
                   Color(red: 0.02, green: 0.03, blue: 0.06)]
                : [Color(red: 0.97, green: 0.98, blue: 1.0),
                   Color(red: 0.93, green: 0.95, blue: 0.99)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    /// 三团品牌色极光：缓慢沿 Lissajous 轨迹漂移、轻微呼吸
    private func auroraLayer(t: TimeInterval, size: CGSize) -> some View {
        ZStack {
            blob(
                color: Color(red: 0.36, green: 0.52, blue: 1.0),
                diameter: max(size.width, size.height) * 0.78,
                opacity: colorScheme == .dark ? 0.42 : 0.30,
                t: t,
                frequency: (0.11, 0.17),
                phase: 0.0,
                size: size
            )
            blob(
                color: Color(red: 0.62, green: 0.40, blue: 0.98),
                diameter: max(size.width, size.height) * 0.62,
                opacity: colorScheme == .dark ? 0.34 : 0.22,
                t: t,
                frequency: (0.08, 0.13),
                phase: 2.4,
                size: size
            )
            blob(
                color: Color(red: 0.28, green: 0.78, blue: 0.92),
                diameter: max(size.width, size.height) * 0.55,
                opacity: colorScheme == .dark ? 0.28 : 0.18,
                t: t,
                frequency: (0.13, 0.09),
                phase: 4.6,
                size: size
            )
        }
        .blur(radius: 60)
        .blendMode(colorScheme == .dark ? .screen : .normal)
        .saturation(1.15)
    }

    /// 减弱动态效果：固定在一个有代表性的构图上（仍有色彩，只是不动）
    private func auroraStatic(size: CGSize) -> some View {
        ZStack {
            blobStatic(color: Color(red: 0.36, green: 0.52, blue: 1.0),
                       diameter: max(size.width, size.height) * 0.78,
                       opacity: colorScheme == .dark ? 0.42 : 0.30,
                       position: CGPoint(x: size.width * 0.72, y: size.height * 0.22))
            blobStatic(color: Color(red: 0.62, green: 0.40, blue: 0.98),
                       diameter: max(size.width, size.height) * 0.62,
                       opacity: colorScheme == .dark ? 0.34 : 0.22,
                       position: CGPoint(x: size.width * 0.2, y: size.height * 0.72))
            blobStatic(color: Color(red: 0.28, green: 0.78, blue: 0.92),
                       diameter: max(size.width, size.height) * 0.55,
                       opacity: colorScheme == .dark ? 0.28 : 0.18,
                       position: CGPoint(x: size.width * 0.78, y: size.height * 0.85))
        }
        .blur(radius: 60)
        .blendMode(colorScheme == .dark ? .screen : .normal)
        .saturation(1.15)
    }

    private func blob(color: Color, diameter: CGFloat, opacity: Double,
                      t: TimeInterval, frequency: (Double, Double), phase: Double,
                      size: CGSize) -> some View {
        let nx = 0.5 + 0.34 * sin(t * frequency.0 * 2 * .pi + phase)
        let ny = 0.5 + 0.38 * cos(t * frequency.1 * 2 * .pi + phase * 1.3)
        let breathe = 1.0 + 0.06 * sin(t * 0.22 + phase)
        return Circle()
            .fill(color)
            .frame(width: diameter * breathe, height: diameter * breathe)
            .opacity(opacity)
            .position(x: nx * size.width, y: ny * size.height)
    }

    private func blobStatic(color: Color, diameter: CGFloat, opacity: Double, position: CGPoint) -> some View {
        Circle()
            .fill(color)
            .frame(width: diameter, height: diameter)
            .opacity(opacity)
            .position(position)
    }
}
