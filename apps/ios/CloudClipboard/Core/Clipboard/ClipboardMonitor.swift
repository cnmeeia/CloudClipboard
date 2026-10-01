//
//  ClipboardMonitor.swift
//  CloudClipboard
//
//  剪贴板自动检测。
//
//  iOS 隐私红线（必须遵守）：
//    1. 只有 App 处于 active 状态才可能读取
//    2. 用户可关闭自动检测（Settings → 自动同步系统剪贴板）
//    3. 使用 detectPatterns 先探测，再读取字符串，减少无谓访问
//    4. 不做后台轮询、不用 UIPasteboard 的 changeCount 做后台监听
//    5. 内容与上次已同步的一致时不重复上传
//

import Foundation
import UIKit
import Observation

@MainActor
@Observable
public final class ClipboardMonitor {
    /// 是否启用（用户开关）
    public var isEnabled: Bool {
        didSet { SharedStore.defaults.set(isEnabled, forKey: Self.enabledKey) }
    }

    /// 最近一次被检测到的剪贴板内容（仅内存，不落盘）
    public private(set) var lastDetectedText: String?

    private let service: ClipboardServiceProtocol
    private let changeCountKey = "clipboardMonitor.lastChangeCount"
    private static let enabledKey = "clipboardMonitor.enabled"

    private var isAppActive = false

    public init(service: ClipboardServiceProtocol = ClipboardService()) {
        self.service = service
        if SharedStore.defaults.object(forKey: Self.enabledKey) == nil {
            // 默认开启，但只在 App 前台且用户切回 App 时检测
            SharedStore.defaults.set(true, forKey: Self.enabledKey)
        }
        self.isEnabled = SharedStore.defaults.bool(forKey: Self.enabledKey)
    }

    /// scenePhase 变化时调用
    public func updateAppActive(_ active: Bool) {
        isAppActive = active
    }

    /// App 进入前台时调用一次：检测是否有「新的」剪贴板内容。
    /// 返回需要上传的文本（nil 表示无需处理）。
    public func detectNewContent() -> String? {
        guard isEnabled, isAppActive else { return nil }

        let pasteboard = UIPasteboard.general
        let changeCount = pasteboard.changeCount
        let lastChangeCount = SharedStore.defaults.integer(forKey: changeCountKey)

        // changeCount 未变化 → 系统剪贴板没被写入过，直接返回（零读取成本）
        guard changeCount != lastChangeCount else { return nil }
        SharedStore.defaults.set(changeCount, forKey: changeCountKey)

        // 先探测是否有文本，避免无谓读取（触发系统剪贴板隐私横幅）。
        // 注：UIPasteboard 并没有 detectedPatterns 属性；真正的模式探测
        // detectPatterns(for:completionHandler:) 是异步回调，此处同步流程用 hasStrings。
        guard pasteboard.hasStrings else { return nil }

        guard let text = service.currentString() else { return nil }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        // 与上次检测内容相同 → 跳过
        guard trimmed != lastDetectedText else { return nil }
        lastDetectedText = trimmed
        return trimmed
    }

    /// 用户主动触发时使用（不受 changeCount 限制）
    public func readCurrentClipboard() -> String? {
        guard let text = service.currentString() else { return nil }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    /// 记录「这个内容已经同步过」，避免重复上传
    public func markSynced(_ text: String) {
        lastDetectedText = text
        SharedStore.defaults.set(UIPasteboard.general.changeCount, forKey: changeCountKey)
    }
}
