//
//  HapticManager.swift
//  CloudClipboard
//
//  统一触感反馈。遵循系统「触感反馈」开关（UIFeedbackGenerator 自动处理）。
//

import Foundation
#if canImport(UIKit)
import UIKit
#endif

@MainActor
public final class HapticManager {
    public static let shared = HapticManager()

    private let impactLight = UIImpactFeedbackGenerator(style: .light)
    private let impactMedium = UIImpactFeedbackGenerator(style: .medium)
    private let impactHeavy = UIImpactFeedbackGenerator(style: .heavy)
    private let selection = UISelectionFeedbackGenerator()
    private let notification = UINotificationFeedbackGenerator()

    public init() {
        prepare()
    }

    /// 提前预热，减少首次触发延迟
    public func prepare() {
        impactLight.prepare()
        impactMedium.prepare()
        notification.prepare()
    }

    public enum Feedback: Sendable {
        case success, warning, error, selection, light, medium, heavy
    }

    public func play(_ feedback: Feedback) {
        switch feedback {
        case .success: notification.notificationOccurred(.success)
        case .warning: notification.notificationOccurred(.warning)
        case .error: notification.notificationOccurred(.error)
        case .selection: selection.selectionChanged()
        case .light: impactLight.impactOccurred()
        case .medium: impactMedium.impactOccurred()
        case .heavy: impactHeavy.impactOccurred()
        }
    }

    /// 语义化：复制成功（轻）
    public func copied() { play(.light) }
    /// 语义化：删除（警告）
    public func deleted() { play(.warning) }
    /// 语义化：同步成功（成功）
    public func synced() { play(.success) }
    /// 语义化：失败（错误）
    public func failed() { play(.error) }
}
