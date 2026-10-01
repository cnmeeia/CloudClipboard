//
//  UserPrefs.swift
//  CloudClipboard
//
//  /api/prefs 的响应与请求（主题 + 通知偏好）。
//

import Foundation

public enum ThemeMode: String, Codable, Sendable, CaseIterable, Identifiable {
    case system, light, dark
    public var id: String { rawValue }
    public var displayName: String {
        switch self {
        case .system: return "跟随系统"
        case .light: return "浅色"
        case .dark: return "深色"
        }
    }
}

public struct NotificationPrefs: Codable, Sendable, Equatable {
    public var newClipboard: Bool
    public var deviceOnline: Bool
    public var deviceAdded: Bool
    public var securityAlert: Bool

    public init(newClipboard: Bool = true, deviceOnline: Bool = false, deviceAdded: Bool = true, securityAlert: Bool = true) {
        self.newClipboard = newClipboard
        self.deviceOnline = deviceOnline
        self.deviceAdded = deviceAdded
        self.securityAlert = securityAlert
    }

    enum CodingKeys: String, CodingKey {
        case newClipboard = "new_clipboard"
        case deviceOnline = "device_online"
        case deviceAdded = "device_added"
        case securityAlert = "security_alert"
    }
}

public struct UserPrefs: Decodable, Sendable, Equatable {
    public let theme: ThemeMode?
    public let notification: NotificationPrefs?
}

public struct PrefsResponse: Decodable, Sendable {
    public let success: Bool
    public let prefs: UserPrefs
}

/// PUT /api/prefs —— 至少提供 theme 或 notification 之一（服务端 zod 校验）
public struct UpdatePrefsRequest: Encodable, Sendable {
    public let theme: ThemeMode?
    public let notification: NotificationPrefs?

    public init(theme: ThemeMode? = nil, notification: NotificationPrefs? = nil) {
        self.theme = theme
        self.notification = notification
    }
}

public struct MeResponse: Decodable, Sendable {
    public let success: Bool
    public let user: MeUser

    public struct MeUser: Decodable, Sendable {
        public let id: String
    }
}

// MARK: - API Token

public struct ApiTokenDTO: Decodable, Sendable, Equatable, Identifiable {
    public let id: String
    public let name: String
    public let createdAt: Int64
    public let lastUsedAt: Int64?
    public let expiresAt: Int64?

    enum CodingKeys: String, CodingKey {
        case id, name
        case createdAt = "created_at"
        case lastUsedAt = "last_used_at"
        case expiresAt = "expires_at"
    }
}

public struct TokenListResponse: Decodable, Sendable {
    public let success: Bool
    public let tokens: [ApiTokenDTO]
    public let count: Int
}

public struct TokenCreateResponse: Decodable, Sendable {
    public let success: Bool
    public let token: TokenPayload

    public struct TokenPayload: Decodable, Sendable {
        public let id: String
        public let apiToken: String
        enum CodingKeys: String, CodingKey {
            case id
            case apiToken = "api_token"
        }
    }
}

public struct CreateTokenRequest: Encodable, Sendable {
    public let name: String
    public let expiresIn: Int?

    public init(name: String, expiresIn: Int? = nil) {
        self.name = name
        self.expiresIn = expiresIn
    }

    enum CodingKeys: String, CodingKey {
        case name
        case expiresIn = "expires_in"
    }
}
