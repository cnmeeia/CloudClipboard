//
//  GlassSurface.swift
//  CloudClipboard
//
//  Liquid Glass 材质封装。
//
//  原则：
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
            .background { glassBackground }
            .clipShape(shape)
    }

    private var shape: some InsettableShape {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
    }

    @ViewBuilder
    private var glassBackground: some View {
        // glassEffect 是 iOS 26 SDK（Xcode 26 / Swift 6.2+）才有的 API；
        // #available 只能做运行时判断，编译期仍需要 SDK 里有这个符号，
        // 所以用 #if compiler(>=6.2) 做编译期隔离。
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            // iOS 26+：系统 Liquid Glass 材质（官方 API，非自绘）
            shape
                .fill(.clear)
                .glassEffect(
                    isInteractive ? .regular.interactive() : .regular,
                    in: shape
                )
                .overlay {
                    if let tint {
                        shape.fill(tint.opacity(0.10))
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
        shape
            .fill(.ultraThinMaterial)
            .overlay {
                // 顶部高光：玻璃受光面的暗示（一条极淡的内描边）
                shape.strokeBorder(
                    LinearGradient(
                        colors: [Color.white.opacity(0.18), Color.white.opacity(0.02)],
                        startPoint: .top, endPoint: .bottom
                    ),
                    lineWidth: 0.6
                )
            }
            .overlay {
                if let tint {
                    shape.fill(tint.opacity(0.10))
                }
            }
    }
}

/// 悬浮操作按钮（FAB）——列表页右下角。
/// iOS 26+ 直接使用系统的玻璃形态圆形按钮；旧系统回退为品牌色实心圆。
struct FloatingActionButton: View {
    var systemImage: String
    var accessibilityTitle: String
    var action: () -> Void

    var body: some View {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            Button(action: action) {
                Image(systemName: systemImage)
                    .font(.system(size: 22, weight: .semibold))
                    .frame(width: 60, height: 60)
            }
            .buttonStyle(.glass)
            .accessibilityLabel(accessibilityTitle)
        } else {
            legacyButton
        }
        #else
        legacyButton
        #endif
    }

    private var legacyButton: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(Color.white)
                .frame(width: 56, height: 56)
                .background(Circle().fill(Color.accentColor.gradient))
                .overlay(Circle().strokeBorder(Color.white.opacity(0.18), lineWidth: 0.5))
                .shadow(color: Color.accentColor.opacity(0.35), radius: 12, y: 6)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityTitle)
    }
}
