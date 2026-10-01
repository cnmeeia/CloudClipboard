//
//  MotionSupport.swift
//  CloudClipboard
//
//  动效与可访问性：尊重「减弱动态效果」。
//  动画克制：只做必要的弹簧过渡，避免列表卡顿（任务书 §23）。
//

import SwiftUI

public enum Motion {
    /// 新增/删除条目
    public static let spring = Animation.spring(response: 0.32, dampingFraction: 0.78)
    /// 页面 / Sheet 过渡
    public static let page = Animation.spring(response: 0.38, dampingFraction: 0.86)
    /// 轻微反馈
    public static let quick = Animation.spring(response: 0.22, dampingFraction: 0.9)
    /// 交错入场步长与最大并发数（避免大列表同时动画）
    public static let staggerStep: Double = 0.035
    public static let staggerMaxItems = 8
}

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
