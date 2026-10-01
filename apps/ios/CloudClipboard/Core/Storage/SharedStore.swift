//
//  SharedStore.swift
//  CloudClipboard
//
//  主 App / Widget / Share Extension 之间的共享容器。
//
//  理想情况用 App Group（group.de.cloudclipboard.ios）共享 Keychain 与文件。
//  但**免费 Apple ID（Personal Team）无法创建 App Group**（需要付费账号），
//  因此这里做能力探测：
//    - 能创建 App Group 容器 → 使用 group.de.cloudclipboard.ios
//    - 不能（未签名 / Personal Team）→ 回退到各自的沙盒目录
//  Share Extension 在回退模式下只能通过「主 App 已持有 Token 的 Keychain 条目」
//  读取凭据——Keychain 的访问组非必须，同 Team 内同 service 可读。
//

import Foundation

public enum SharedStore {
    /// App Group 标识（需在 entitlements 声明，且账号支持）
    public static let appGroupIdentifier = "group.de.cloudclipboard.ios.dev"

    /// Keychain 访问组（不设置 access group 时，同 App 及其 Extension 共享同一 service）
    public static let keychainService = "de.cloudclipboard.credentials"

    /// 共享 UserDefaults（仅存非敏感配置：Worker URL、主题、开关）
    public static var defaults: UserDefaults {
        UserDefaults(suiteName: appGroupIdentifier) ?? .standard
    }

    /// 是否真的能用 App Group（免费账号下为 false）
    public static var isAppGroupAvailable: Bool {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier) != nil
    }

    /// 共享容器目录（App Group 优先，回退到 App Support）
    public static var containerURL: URL {
        if let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier) {
            return url
        }
        let fallback = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
        let directory = fallback.appendingPathComponent("CloudClipboardShared", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }

    /// SwiftData 数据库路径（App Group 与回退模式共用同一逻辑）
    public static var databaseURL: URL {
        containerURL.appendingPathComponent("CloudClipboard.store")
    }
}

// MARK: - 共享的非敏感配置键

public enum SharedKeys {
    public static let workerURL = "shared.workerURL"
    public static let theme = "shared.theme"
    public static let biometricPolicy = "shared.biometricPolicy"
    public static let spotlightEnabled = "shared.spotlightEnabled"
    public static let lastSyncAt = "shared.lastSyncAt"
    public static let widgetItems = "shared.widgetItems"
    public static let uploadTTLMs = "shared.uploadTTLMs"
}

/// 共享配置读写（**只放非敏感数据**，Token / 种子短语一律走 Keychain）
public struct SharedSettings: Sendable {
    private let defaults: UserDefaults

    public init(defaults: UserDefaults = SharedStore.defaults) {
        self.defaults = defaults
    }

    public var workerURL: String {
        get { defaults.string(forKey: SharedKeys.workerURL) ?? Self.defaultWorkerURL }
        nonmutating set { defaults.set(newValue, forKey: SharedKeys.workerURL) }
    }

    /// 默认 Worker 地址 = 现有 PWA 的自定义域（见 apps/worker/wrangler.jsonc routes）
    public static let defaultWorkerURL = "https://clip.0272.de5.net"

    public var theme: ThemeMode {
        get { ThemeMode(rawValue: defaults.string(forKey: SharedKeys.theme) ?? "") ?? .system }
        nonmutating set { defaults.set(newValue.rawValue, forKey: SharedKeys.theme) }
    }

    public var biometricPolicy: BiometricPolicy {
        get { BiometricPolicy(rawValue: defaults.string(forKey: SharedKeys.biometricPolicy) ?? "") ?? .never }
        nonmutating set { defaults.set(newValue.rawValue, forKey: SharedKeys.biometricPolicy) }
    }

    public var spotlightEnabled: Bool {
        get { defaults.bool(forKey: SharedKeys.spotlightEnabled) }
        nonmutating set { defaults.set(newValue, forKey: SharedKeys.spotlightEnabled) }
    }

    public var lastSyncAt: Date? {
        get {
            let value = defaults.double(forKey: SharedKeys.lastSyncAt)
            return value > 0 ? Date(timeIntervalSince1970: value) : nil
        }
        nonmutating set { defaults.set(newValue?.timeIntervalSince1970 ?? 0, forKey: SharedKeys.lastSyncAt) }
    }

    /// 上传 TTL（毫秒）；nil = 永久（与 Web 的「永久」默认一致）
    public var uploadTTLMs: Int? {
        get {
            guard defaults.object(forKey: SharedKeys.uploadTTLMs) != nil else { return nil }
            let value = defaults.integer(forKey: SharedKeys.uploadTTLMs)
            return value > 0 ? value : nil
        }
        nonmutating set {
            if let newValue { defaults.set(newValue, forKey: SharedKeys.uploadTTLMs) }
            else { defaults.removeObject(forKey: SharedKeys.uploadTTLMs) }
        }
    }
}
