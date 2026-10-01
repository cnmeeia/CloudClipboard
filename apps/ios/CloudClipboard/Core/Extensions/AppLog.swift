//
//  AppLog.swift
//  CloudClipboard
//
//  OSLog 封装。
//
//  安全要求（见任务书 §26）：
//    - 生产环境禁止 print(token) / print(encryptionKey) / print(clipboardContent)
//    - 全部走 OSLog，且敏感字段一律不记录
//  这里通过「只提供固定 category + 不提供字符串插值便利方法」来强制约束：
//  调用方必须自己决定插值内容，且我们在此文件顶部写明红线。
//
//  ⚠️ 严禁把以下内容写进日志：
//     明文剪贴板内容、API Token、种子短语、master key、item key、JWT
//

import Foundation
import OSLog

public enum AppLog {
    private static let subsystem = Bundle.main.bundleIdentifier ?? "de.cloudclipboard.ios.dev"

    public static let api = Logger(subsystem: subsystem, category: "api")
    public static let crypto = Logger(subsystem: subsystem, category: "crypto")
    public static let storage = Logger(subsystem: subsystem, category: "storage")
    public static let sync = Logger(subsystem: subsystem, category: "sync")
    public static let ui = Logger(subsystem: subsystem, category: "ui")
    public static let background = Logger(subsystem: subsystem, category: "background")
    public static let share = Logger(subsystem: subsystem, category: "share")
    public static let widget = Logger(subsystem: subsystem, category: "widget")
    public static let security = Logger(subsystem: subsystem, category: "security")

    /// 日志脱敏：仅保留长度与前 2 位，用于排查「空/非空」「长度异常」类问题
    public static func redact(_ value: String?) -> String {
        guard let value, !value.isEmpty else { return "<empty>" }
        return "<\(value.count) chars>"
    }
}
