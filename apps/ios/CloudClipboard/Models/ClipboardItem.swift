//
//  ClipboardItem.swift
//  CloudClipboard
//
//  与 packages/types 的 ClipboardItem 对齐（JSON 字段名保持一致）。
//

import Foundation

public typealias ClipboardID = String

/// 剪贴板类型（服务端 enum：text | url | code | image | file）
public enum ClipboardType: String, Codable, Sendable, CaseIterable, Identifiable {
    case text, url, code, image, file

    public var id: String { rawValue }

    public var systemImage: String {
        switch self {
        case .text: return "text.alignleft"
        case .url: return "link"
        case .code: return "chevron.left.forwardslash.chevron.right"
        case .image: return "photo"
        case .file: return "doc"
        }
    }

    public var displayName: String {
        switch self {
        case .text: return "文本"
        case .url: return "链接"
        case .code: return "代码"
        case .image: return "图片"
        case .file: return "文件"
        }
    }

    /// 从明文内容推断类型（与 Web 端智能识别保持一致的保守策略：
    /// 只区分 url / code，其余交给 text，避免和后端存储的类型打架）
    public static func infer(from content: String) -> ClipboardType {
        let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://"),
           !trimmed.contains(" "),
           URL(string: trimmed) != nil {
            return .url
        }
        let codeHints = ["function ", "const ", "let ", "var ", "def ", "class ", "import ", "SELECT ", "#!/", "{", "=>", "();"]
        if codeHints.contains(where: { trimmed.contains($0) }) {
            return .code
        }
        return .text
    }
}

/// 服务端条目（DTO）。字段名与 Worker 返回的 snake_case 完全一致。
public struct ClipboardItemDTO: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let deviceId: String
    public let deviceName: String
    public let type: ClipboardType
    public let encryptedData: String?
    public let iv: String?
    public let salt: String?
    public let wrappedKey: String?
    public let r2Key: String?
    public let size: Int?
    public let mimeType: String?
    public let filename: String?
    public let plain: Int?
    public let createdAt: Int64
    public let expiresAt: Int64?
    /// 仅 GET /api/clipboard/:id 返回（图片/文件 base64），列表不返回
    public let base64Content: String?

    public init(
        id: String,
        deviceId: String,
        deviceName: String,
        type: ClipboardType,
        encryptedData: String? = nil,
        iv: String? = nil,
        salt: String? = nil,
        wrappedKey: String? = nil,
        r2Key: String? = nil,
        size: Int? = nil,
        mimeType: String? = nil,
        filename: String? = nil,
        plain: Int? = nil,
        createdAt: Int64,
        expiresAt: Int64? = nil,
        base64Content: String? = nil
    ) {
        self.id = id
        self.deviceId = deviceId
        self.deviceName = deviceName
        self.type = type
        self.encryptedData = encryptedData
        self.iv = iv
        self.salt = salt
        self.wrappedKey = wrappedKey
        self.r2Key = r2Key
        self.size = size
        self.mimeType = mimeType
        self.filename = filename
        self.plain = plain
        self.createdAt = createdAt
        self.expiresAt = expiresAt
        self.base64Content = base64Content
    }

    public var isPlain: Bool { (plain ?? 0) == 1 }
    public var createdDate: Date { Date(timeIntervalSince1970: Double(createdAt) / 1000) }
    public var expiresDate: Date? { expiresAt.map { Date(timeIntervalSince1970: Double($0) / 1000) } }

    enum CodingKeys: String, CodingKey {
        case id, type, iv, salt, size, filename, plain
        case deviceId = "device_id"
        case deviceName = "device_name"
        case encryptedData = "encrypted_data"
        case wrappedKey = "wrapped_key"
        case r2Key = "r2_key"
        case mimeType = "mime_type"
        case createdAt = "created_at"
        case expiresAt = "expires_at"
        case base64Content = "base64_content"
    }
}

// MARK: - 响应包

public struct ClipboardListResponse: Decodable, Sendable {
    public let success: Bool
    public let items: [ClipboardItemDTO]
    public let count: Int
}

public struct ClipboardItemResponse: Decodable, Sendable {
    public let success: Bool
    public let item: ClipboardItemDTO
}

public struct ClipboardCreateResponse: Decodable, Sendable {
    public let success: Bool
    public let item: ClipboardItemDTO
    public let push: PushResult?
    public let deduplicated: Bool?
    public let note: String?
}

public struct PushResult: Decodable, Sendable {
    public let sent: Int
    public let total: Int
}

// MARK: - 上传请求体

/// POST /api/clipboard 的请求体（与 createClipboardSchema 字段一一对应）
public struct ClipboardCreateRequest: Encodable, Sendable {
    public let type: ClipboardType
    public let encryptedData: String
    public let iv: String
    public let salt: String?
    public let wrappedKey: String?
    public let r2Key: String?
    public let size: Int?
    public let mimeType: String?
    public let filename: String?
    public let expiresIn: Int?

    public init(
        type: ClipboardType,
        encryptedData: String,
        iv: String,
        salt: String? = nil,
        wrappedKey: String? = nil,
        r2Key: String? = nil,
        size: Int? = nil,
        mimeType: String? = nil,
        filename: String? = nil,
        expiresIn: Int? = nil
    ) {
        self.type = type
        self.encryptedData = encryptedData
        self.iv = iv
        self.salt = salt
        self.wrappedKey = wrappedKey
        self.r2Key = r2Key
        self.size = size
        self.mimeType = mimeType
        self.filename = filename
        self.expiresIn = expiresIn
    }

    enum CodingKeys: String, CodingKey {
        case type, iv, salt, size, filename
        case encryptedData = "encrypted_data"
        case wrappedKey = "wrapped_key"
        case r2Key = "r2_key"
        case mimeType = "mime_type"
        case expiresIn = "expires_in"
    }
}
