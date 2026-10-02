//
//  MotionSupport.swift
//  CloudClipboard
//
//  全局动效语言。
//
//  原则：
//    - 统一的弹簧曲线（Apple HIG：spring 表达「材质回归」）
//    - 克制：动效解释状态与层级，不做无意义的装饰
//    - 全局尊重「减弱动态效果」，降级为淡入而非位移
//

import SwiftUI

public enum Motion {
    /// 元素增删 / 列表重排
    public static let spring = Animation.snappy(duration: 0.34)
    /// 页面、Sheet 的层级过渡
    public static let page = Animation.smooth(duration: 0.42)
    /// 即时反馈（按压、开关）
    public static let quick = Animation.snappy(duration: 0.22)
    /// 强调时刻（成功、解锁）
    public static let hero = Animation.spring(response: 0.52, dampingFraction: 0.72)
    /// 退出（快于进入）
    public static let dismiss = Animation.snappy(duration: 0.24)

    /// 交错入场步长与最大并发数（避免大列表同时动画）
    public static let staggerStep: Double = 0.04
    public static let staggerMaxItems = 8
}

// MARK: - 减弱动态效果

private struct MotionAnimationModifier: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let animation: Animation

    func body(content: Content) -> some View {
        content.transaction { transaction in
            transaction.animation = reduceMotion ? nil : animation
        }
    }
}

public extension View {
    /// 按「减弱动态效果」自动降级：开启时不做动画
    func motion(_ animation: Animation) -> some View {
        modifier(MotionAnimationModifier(animation: animation))
    }
}

// MARK: - 自适应玻璃按钮样式

/// 给视图内部的按钮应用自适应样式：iOS 26+ 用系统玻璃按钮，旧系统回退 .bordered。
/// 作为视图修饰符使用（ButtonStyle 的不透明返回类型无法在 makeBody 内分支）。
struct AdaptiveGlassButton: ViewModifier {
    func body(content: Content) -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            content.buttonStyle(.glass)
        } else {
            content.buttonStyle(.bordered)
        }
        #else
        content.buttonStyle(.bordered)
        #endif
    }
}

extension View {
    /// iOS 26+ 玻璃按钮，旧系统 .bordered
    func adaptiveGlassButton() -> some View {
        modifier(AdaptiveGlassButton())
    }
}
