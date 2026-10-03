//
//  Device.swift
//  CloudClipboard
//

import Foundation

public struct DeviceDTO: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let name: String
    public let platform: String
    public let browser: String?
    public let deviceType: String
    public let lastSeen: Int64
    public let createdAt: Int64
    public let updatedAt: Int64
    public let revokedAt: Int64?
    public let online: Bool?
    public let status: String?
    public let barkUrl: String?

    public var lastSeenDate: Date { Date(timeIntervalSince1970: Double(lastSeen) / 1000) }

    public var isOnline: Bool {
        online ?? (Date().timeIntervalSince1970 - Double(lastSeen) / 1000 < 300)
    }

    enum CodingKeys: String, CodingKey {
        case id, name, platform, browser, online, status
        case deviceType = "device_type"
        case lastSeen = "last_seen"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case revokedAt = "revoked_at"
        case barkUrl = "bark_url"
    }
}

public struct DeviceListResponse: Decodable, Sendable {
    public let success: Bool
    public let devices: [DeviceDTO]
}

public struct DeviceResponse: Decodable, Sendable {
    public let success: Bool
    public let device: DeviceDTO
}

/// POST /api/devices/register —— device_type 仅接受 pwa | cli | extension | other
public struct RegisterDeviceRequest: Encodable, Sendable {
    public let id: String
    public let name: String
    public let platform: String
    public let browser: String?
    public let deviceType: String

    public init(id: String, name: String, platform: String = "ios", browser: String? = nil, deviceType: String = "other") {
        self.id = id
        self.name = name
        self.platform = platform
        self.browser = browser
        self.deviceType = deviceType
    }

    enum CodingKeys: String, CodingKey {
        case id, name, platform, browser
        case deviceType = "device_type"
    }
}

public struct UpdateDeviceRequest: Encodable, Sendable {
    public let name: String?
    public let barkUrl: String?

    public init(name: String? = nil, barkUrl: String? = nil) {
        self.name = name
        self.barkUrl = barkUrl
    }

    enum CodingKeys: String, CodingKey {
        case name
        case barkUrl = "bark_url"
    }
}
