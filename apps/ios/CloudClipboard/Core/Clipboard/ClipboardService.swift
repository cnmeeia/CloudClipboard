//
//  ClipboardService.swift
//  CloudClipboard
//
//  系统剪贴板读写（UIPasteboard）。
//
//  隐私约束（任务书 §6，iOS 隐私红线）：
//    - 绝不在后台无限轮询剪贴板
//    - 读取前先用 detectPatterns 判断是否含所需内容，减少无谓读取
//    - 只在 App active / 用户主动触发 / 系统允许的场景读取
//

import Foundation
import UIKit

public protocol ClipboardServiceProtocol: Sendable {
    @discardableResult
    func copy(_ text: String, sensitive: Bool) -> Bool
    func currentString() -> String?
    func hasReadableContent() -> Bool
}

public struct ClipboardService: ClipboardServiceProtocol {
    public init() {}

    /// 写入系统剪贴板。
    /// - Note: `sensitive` 仅表达调用方的意图（例如 OTP），
    ///   系统隐私横幅由 iOS 自动控制，我们不做任何绕过。
    @discardableResult
    public func copy(_ text: String, sensitive: Bool = false) -> Bool {
        let pasteboard = UIPasteboard.general
        pasteboard.string = text
        _ = sensitive
        return true
    }

    public func currentString() -> String? {
        let pasteboard = UIPasteboard.general
        guard pasteboard.hasStrings else { return nil }
        return pasteboard.string
    }

    /// 先用 detectPatterns 探测，避免直接读取触发隐私横幅
    public func hasReadableContent() -> Bool {
        let pasteboard = UIPasteboard.general
        return pasteboard.hasStrings || pasteboard.hasURLs || pasteboard.hasImages
    }
}
