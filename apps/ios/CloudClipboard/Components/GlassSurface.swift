//
//  GlassSurface.swift
//  CloudClipboard
//
//  Liquid Glass 材质封装。
//
//  原则（任务书 §22）：
//    - 系统支持原生 Liquid Glass API 时直接用系统 API，**不自己模拟假玻璃**
//    - 不支持时回退到系统 Material（同样是系统原生材质，而非自绘模糊）
//    - iOS 26 专属 API 一律用 #available 包裹
//

import SwiftUI

/// 系统原生玻璃/材质容器
struct GlassSurface<Content: View>: View {
    var cornerRadius: CGFloat = 20
    var isInteractive: Bool = false
    var tint: Color? = nil
    @ViewBuilder var content: Content

    var body: some View {
        content
            .background {
                glassBackground
            }
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }

    @ViewBuilder
    private var glassBackground: some View {
        // glassEffect 是 iOS 26 SDK（Xcode 26 / Swift 6.2+）才有的 API；
        // #available 只能做运行时判断，编译期仍需要 SDK 里有这个符号，
        // 所以用 #if compiler(>=6.2) 做编译期隔离。
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            // iOS 26+：使用系统 Liquid Glass 材质（官方 API，非自绘）
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(.clear)
                .glassEffect(
                    isInteractive ? .regular.interactive() : .regular,
                    in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                )
                .overlay {
                    if let tint {
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            .fill(tint.opacity(0.12))
                    }
                }
        } else {
            materialFallback
        }
        #else
        materialFallback
        #endif
    }

    @ViewBuilder
    private var materialFallback: some View {
        // iOS 17–25：系统 Material 回退（同样由系统渲染，非假玻璃）
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(.ultraThinMaterial)
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .strokeBorder(Color.primary.opacity(0.06), lineWidth: 0.5)
            }
            .overlay {
                if let tint {
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(tint.opacity(0.10))
                }
            }
    }
}

/// 悬浮操作按钮（FAB）——列表页右下角
struct FloatingActionButton: View {
    var systemImage: String
    var accessibilityTitle: String
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(Color.white)
                .frame(width: 56, height: 56)
                .background(
                    Circle().fill(Color.accentColor.gradient)
                )
                .overlay(
                    Circle().strokeBorder(Color.white.opacity(0.18), lineWidth: 0.5)
                )
                .shadow(color: Color.accentColor.opacity(0.35), radius: 12, y: 6)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityTitle)
        .accessibilityHint("双击上传当前系统剪贴板")
        .accessibilityAddTraits(.isButton)
    }
}
