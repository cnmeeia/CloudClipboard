//
//  CachedClipboardItem.swift
//  CloudClipboard
//
//  SwiftData 本地离线缓存。
//
//  重要：**本地只存密文**，不存明文。
//  明文只在内存里短暂存在（解密后即用即弃），需要重新读取时用 Keychain 里的
//  master key 重新解密。这样即使设备被取证，也只拿到密文。
//

import Foundation
import SwiftData

public enum SyncState: String, Codable, Sendable, CaseIterable {
    case synced
    case pending
    case failed
    case deleted

    public var displayName: String {
        switch self {
        case .synced: return "已同步"
        case .pending: return "等待上传"
        case .failed: return "同步失败"
        case .deleted: return "已删除"
        }
    }
}

@Model
public final class CachedClipboardItem {
    /// 服务端 id；本地新建（离线）时为临时 UUID，上传成功后回填
    @Attribute(.unique) public var id: String
    public var deviceId: String
    public var deviceName: String
    public var typeRaw: String

    /// 密文（base64url）—— 禁止在此存放明文
    public var encryptedData: String
    public var iv: String
    public var salt: String?
    public var wrappedKey: String?
    public var r2Key: String?
    public var size: Int?
    public var mimeType: String?
    public var filename: String?
    public var plain: Bool
    public var createdAt: Date
    public var expiresAt: Date?
    public var syncStateRaw: String
    public var lastError: String?
    public var updatedAt: Date
    /// 本地创建（尚未获得服务端 id）
    public var isLocalOnly: Bool

    public var type: ClipboardType {
        get { ClipboardType(rawValue: typeRaw) ?? .text }
        set { typeRaw = newValue.rawValue }
    }

    public var syncState: SyncState {
        get { SyncState(rawValue: syncStateRaw) ?? .synced }
        set { syncStateRaw = newValue.rawValue }
    }

    public init(
        id: String,
        deviceId: String,
        deviceName: String,
        type: ClipboardType,
        encryptedData: String,
        iv: String,
        salt: String? = nil,
        wrappedKey: String? = nil,
        r2Key: String? = nil,
        size: Int? = nil,
        mimeType: String? = nil,
        filename: String? = nil,
        plain: Bool = false,
        createdAt: Date = Date(),
        expiresAt: Date? = nil,
        syncState: SyncState = .synced,
        lastError: String? = nil,
        isLocalOnly: Bool = false
    ) {
        self.id = id
        self.deviceId = deviceId
        self.deviceName = deviceName
        self.typeRaw = type.rawValue
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
        self.syncStateRaw = syncState.rawValue
        self.lastError = lastError
        self.updatedAt = Date()
        self.isLocalOnly = isLocalOnly
    }
}

// MARK: - DTO 互转

public extension CachedClipboardItem {
    convenience init(dto: ClipboardItemDTO) {
        self.init(
            id: dto.id,
            deviceId: dto.deviceId,
            deviceName: dto.deviceName,
            type: dto.type,
            encryptedData: dto.encryptedData ?? "",
            iv: dto.iv ?? "",
            salt: dto.salt,
            wrappedKey: dto.wrappedKey,
            r2Key: dto.r2Key,
            size: dto.size,
            mimeType: dto.mimeType,
            filename: dto.filename,
            plain: dto.isPlain,
            createdAt: dto.createdDate,
            expiresAt: dto.expiresDate,
            syncState: .synced
        )
    }

    func toDTO() -> ClipboardItemDTO {
        ClipboardItemDTO(
            id: id,
            deviceId: deviceId,
            deviceName: deviceName,
            type: type,
            encryptedData: encryptedData,
            iv: iv,
            salt: salt,
            wrappedKey: wrappedKey,
            r2Key: r2Key,
            size: size,
            mimeType: mimeType,
            filename: filename,
            plain: plain ? 1 : 0,
            createdAt: Int64(createdAt.timeIntervalSince1970 * 1000),
            expiresAt: expiresAt.map { Int64($0.timeIntervalSince1970 * 1000) },
            base64Content: nil
        )
    }
}
