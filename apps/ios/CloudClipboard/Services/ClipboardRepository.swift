//
//  ClipboardRepository.swift
//  CloudClipboard
//
//  剪贴板数据仓库：网络 + 本地缓存 + 加解密。
//
//  离线优先：
//    - 拉取：网络成功 → upsert 到 SwiftData；失败 → 读本地缓存，UI 显示「离线」
//    - 上传：先写本地（syncState = pending），网络成功 → 回填服务端 id 并置 synced
//    - 明文永不落盘
//

import Foundation
import SwiftData
import CloudClipboardShared

@MainActor
@Observable
public final class ClipboardRepository {
    public private(set) var items: [ClipboardItemDTO] = []
    public private(set) var isLoading = false
    public private(set) var loadError: String?
    public private(set) var isOffline = false
    public private(set) var isPushing = false

    /// 解密后的明文缓存（仅内存，最多 100 条）
    private var plaintextCache: [String: String] = [:]
    private var cacheOrder: [String] = []
    private let plaintextCacheLimit = 100

    private let apiClient: APIClientProtocol
    private let crypto: CryptoServiceProtocol
    private let auth: AuthRepository
    private let deviceRepository: DeviceRepository
    private let settings: SharedSettings
    private let modelContainer: ModelContainer?
    private let serverLimit: Int

    /// 与 shared 的 CLIPBOARD_LIST_LIMIT 保持一致（服务端上限 200）
    public static let defaultLimit = 200

    public init(
        apiClient: APIClientProtocol,
        crypto: CryptoServiceProtocol,
        auth: AuthRepository,
        deviceRepository: DeviceRepository,
        modelContainer: ModelContainer? = nil,
        settings: SharedSettings = SharedSettings(),
        limit: Int = ClipboardRepository.defaultLimit
    ) {
        self.apiClient = apiClient
        self.crypto = crypto
        self.auth = auth
        self.deviceRepository = deviceRepository
        self.modelContainer = modelContainer
        self.settings = settings
        self.serverLimit = limit
    }

    // MARK: 拉取

    /// 拉取列表。`force` = true 时忽略本地缓存直接请求网络。
    public func refresh(showSpinner: Bool = true) async {
        if showSpinner { isLoading = true }
        defer { isLoading = false }

        do {
            let response = try await apiClient.send(
                Endpoints.listClipboard(limit: serverLimit),
                as: ClipboardListResponse.self
            )
            items = response.items
            isOffline = false
            loadError = nil
            settings.lastSyncAt = Date()
            persist(items)
        } catch {
            isOffline = true
            loadError = (error as? LocalizedError)?.errorDescription ?? "无法加载列表"
            // 离线回退：读本地缓存
            let cached = loadCachedItems()
            if !cached.isEmpty { items = cached }
        }
    }

    /// 拉取单条（含图片/文件的 base64_content）
    public func fetchDetail(id: String) async throws -> ClipboardItemDTO {
        do {
            let response = try await apiClient.send(Endpoints.getClipboard(id: id), as: ClipboardItemResponse.self)
            plaintextCache.removeValue(forKey: id)
            return response.item
        } catch {
            // 离线时回退本地缓存
            if let cached = items.first(where: { $0.id == id }) { return cached }
            throw error
        }
    }

    // MARK: 上传

    /// 上传结果（命名带前缀，避免与 API DTO 的 `PushResult` 混淆）
    public enum UploadOutcome: Sendable, Equatable {
        case success(id: String, deduplicated: Bool)
        case queuedLocally
        case failure(String)
    }

    /// 加密并上传一条剪贴板内容。
    /// - 明文只在方法内存在，不写日志、不落盘。
    public func push(
        content: String,
        type: ClipboardType? = nil,
        ttlMs: Int? = nil,
        filename: String? = nil,
        mimeType: String? = nil
    ) async -> UploadOutcome {
        let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return .failure("内容为空，没有可同步的内容") }

        isPushing = true
        defer { isPushing = false }

        let resolvedType = type ?? ClipboardType.infer(from: trimmed)
        let effectiveTTL = ttlMs ?? settings.uploadTTLMs

        let payload: EncryptedPayload
        do {
            let key = try auth.masterKey()
            payload = try crypto.encryptClipboardContent(trimmed, masterKey: key)
        } catch {
            return .failure((error as? LocalizedError)?.errorDescription ?? "加密失败")
        }

        let body = ClipboardCreateRequest(
            type: resolvedType,
            encryptedData: payload.encrypted,
            iv: payload.iv,
            salt: payload.salt,
            wrappedKey: payload.wrappedKey,
            r2Key: nil,
            size: trimmed.utf8.count,
            mimeType: mimeType,
            filename: filename,
            expiresIn: effectiveTTL
        )

        do {
            let response = try await apiClient.send(
                Endpoints.createClipboard(body: try JSONEncoder().encode(body)),
                as: ClipboardCreateResponse.self
            )
            cachePlaintext(trimmed, for: response.item.id)
            upsert(response.item)
            // 上传成功后立即置为已同步
            updateSyncState(id: response.item.id, state: .synced)
            return .success(id: response.item.id, deduplicated: response.deduplicated ?? false)
        } catch {
            // 网络失败 → 入本地 outbox，等网络恢复重放
            let queued = queueLocally(
                payload: payload,
                type: resolvedType,
                size: trimmed.utf8.count,
                ttlMs: effectiveTTL,
                error: (error as? LocalizedError)?.errorDescription
            )
            return queued ? .queuedLocally : .failure((error as? LocalizedError)?.errorDescription ?? "上传失败")
        }
    }

    // MARK: 删除

    public func delete(id: String) async -> Bool {
        cachePlaintext(nil, for: id)
        do {
            _ = try await apiClient.send(Endpoints.deleteClipboard(id: id))
            items.removeAll { $0.id == id }
            deleteCached(id: id)
            return true
        } catch {
            // 离线删除：标记为 deleted，等联网后重放
            updateSyncState(id: id, state: .deleted)
            items.removeAll { $0.id == id }
            loadError = (error as? LocalizedError)?.errorDescription
            return false
        }
    }

    // MARK: 解密

    /// 解密条目内容（明文只在内存）
    /// - plain = 1 的历史记录（curl 明文上传）直接返回原始内容
    public func plaintext(for item: ClipboardItemDTO) -> String? {
        if let cached = plaintextCache[item.id] { return cached }

        if item.isPlain, let raw = item.encryptedData {
            cachePlaintext(raw, for: item.id)
            return raw
        }

        guard let encrypted = item.encryptedData,
              let iv = item.iv,
              let wrapped = item.wrappedKey,
              let salt = item.salt else {
            return nil
        }

        guard let key = try? auth.masterKey() else { return nil }

        guard let text = try? crypto.decryptClipboardContent(
            encrypted: encrypted,
            iv: iv,
            wrappedKey: wrapped,
            salt: salt,
            masterKey: key
        ) else {
            return nil
        }

        cachePlaintext(text, for: item.id)
        return text
    }

    /// 批量预热解密（用于列表首屏），最多前 `limit` 条
    public func warmPlaintextCache(limit: Int = 30) {
        guard auth.state.isReady else { return }
        for item in items.prefix(limit) where plaintextCache[item.id] == nil {
            _ = plaintext(for: item)
        }
    }

    // MARK: 本地搜索

    /// 在已解密的内存缓存 + 条目元数据上做本地过滤
    public func search(_ query: String) -> [ClipboardItemDTO] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmed.isEmpty else { return items }
        return items.filter { item in
            if item.deviceName.lowercased().contains(trimmed) { return true }
            if item.type.rawValue.contains(trimmed) { return true }
            if let filename = item.filename, filename.lowercased().contains(trimmed) { return true }
            if let text = plaintextCache[item.id], text.lowercased().contains(trimmed) { return true }
            return false
        }
    }

    // MARK: Outbox 重放

    /// 重放本地待上传条目（网络恢复 / 后台任务时调用）
    @discardableResult
    public func flushOutbox() async -> Int {
        guard auth.state.isReady, let container = modelContainer else { return 0 }
        let context = ModelContext(container)
        let descriptor = FetchDescriptor<CachedClipboardItem>(
            predicate: #Predicate { $0.syncStateRaw == "pending" || $0.syncStateRaw == "deleted" }
        )
        guard let pendingItems = try? context.fetch(descriptor), !pendingItems.isEmpty else { return 0 }

        var syncedCount = 0
        for cached in pendingItems {
            if cached.syncState == .deleted {
                if (try? await apiClient.send(Endpoints.deleteClipboard(id: cached.id))) != nil {
                    context.delete(cached)
                    syncedCount += 1
                }
                continue
            }

            let body = ClipboardCreateRequest(
                type: cached.type,
                encryptedData: cached.encryptedData,
                iv: cached.iv,
                salt: cached.salt,
                wrappedKey: cached.wrappedKey,
                r2Key: cached.r2Key,
                size: cached.size,
                mimeType: cached.mimeType,
                filename: cached.filename,
                expiresIn: nil
            )
            do {
                let response = try await apiClient.send(
                    Endpoints.createClipboard(body: try JSONEncoder().encode(body)),
                    as: ClipboardCreateResponse.self
                )
                cached.syncState = .synced
                cached.lastError = nil
                cached.updatedAt = Date()
                syncedCount += 1
                // 服务端 id 与本地临时 id 不同 → 删除临时行，插入正式行
                if response.item.id != cached.id {
                    context.delete(cached)
                    context.insert(CachedClipboardItem(dto: response.item))
                }
            } catch {
                cached.syncState = .failed
                cached.lastError = (error as? LocalizedError)?.errorDescription
            }
        }
        try? context.save()
        if syncedCount > 0 { await refresh(showSpinner: false) }
        return syncedCount
    }

    // MARK: SwiftData 读写

    private func persist(_ dtos: [ClipboardItemDTO]) {
        guard let container = modelContainer else { return }
        let context = ModelContext(container)
        for dto in dtos {
            let id = dto.id
            let descriptor = FetchDescriptor<CachedClipboardItem>(
                predicate: #Predicate { $0.id == id }
            )
            if let existing = try? context.fetch(descriptor).first {
                existing.deviceName = dto.deviceName
                existing.typeRaw = dto.type.rawValue
                existing.encryptedData = dto.encryptedData ?? existing.encryptedData
                existing.iv = dto.iv ?? existing.iv
                existing.salt = dto.salt ?? existing.salt
                existing.wrappedKey = dto.wrappedKey ?? existing.wrappedKey
                existing.r2Key = dto.r2Key ?? existing.r2Key
                existing.size = dto.size ?? existing.size
                existing.mimeType = dto.mimeType ?? existing.mimeType
                existing.filename = dto.filename ?? existing.filename
                existing.expiresAt = dto.expiresDate
                existing.syncState = .synced
                existing.lastError = nil
                existing.updatedAt = Date()
            } else {
                context.insert(CachedClipboardItem(dto: dto))
            }
        }
        try? context.save()
    }

    private func upsert(_ dto: ClipboardItemDTO) {
        items.removeAll { $0.id == dto.id }
        items.insert(dto, at: 0)
        persist([dto])
    }

    private func loadCachedItems() -> [ClipboardItemDTO] {
        guard let container = modelContainer else { return [] }
        let context = ModelContext(container)
        let descriptor = FetchDescriptor<CachedClipboardItem>(
            predicate: #Predicate { $0.syncStateRaw != "deleted" },
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        guard let cached = try? context.fetch(descriptor) else { return [] }
        return cached.map { $0.toDTO() }
    }

    private func deleteCached(id: String) {
        guard let container = modelContainer else { return }
        let context = ModelContext(container)
        let descriptor = FetchDescriptor<CachedClipboardItem>(predicate: #Predicate { $0.id == id })
        if let row = try? context.fetch(descriptor).first {
            context.delete(row)
            try? context.save()
        }
    }

    private func updateSyncState(id: String, state: SyncState) {
        guard let container = modelContainer else { return }
        let context = ModelContext(container)
        let descriptor = FetchDescriptor<CachedClipboardItem>(predicate: #Predicate { $0.id == id })
        if let row = try? context.fetch(descriptor).first {
            row.syncState = state
            row.updatedAt = Date()
            try? context.save()
        }
    }

    /// 网络失败时把密文入本地 outbox（密文可以落盘，明文中不行）
    private func queueLocally(
        payload: EncryptedPayload,
        type: ClipboardType,
        size: Int,
        ttlMs: Int?,
        error: String?
    ) -> Bool {
        guard let container = modelContainer else { return false }
        let context = ModelContext(container)
        let localId = "local-\(UUID().uuidString)"
        let item = CachedClipboardItem(
            id: localId,
            deviceId: deviceRepository.deviceId,
            deviceName: deviceRepository.deviceName,
            type: type,
            encryptedData: payload.encrypted,
            iv: payload.iv,
            salt: payload.salt,
            wrappedKey: payload.wrappedKey,
            size: size,
            createdAt: Date(),
            expiresAt: ttlMs.map { Date(timeIntervalSinceNow: Double($0) / 1000) },
            syncState: .pending,
            lastError: error,
            isLocalOnly: true
        )
        context.insert(item)
        do {
            try context.save()
            items.insert(item.toDTO(), at: 0)
            return true
        } catch {
            return false
        }
    }

    // MARK: 明文内存缓存（LRU）

    private func cachePlaintext(_ text: String?, for id: String) {
        guard let text else {
            plaintextCache.removeValue(forKey: id)
            cacheOrder.removeAll { $0 == id }
            return
        }
        plaintextCache[id] = text
        cacheOrder.removeAll { $0 == id }
        cacheOrder.append(id)
        while cacheOrder.count > plaintextCacheLimit, let oldest = cacheOrder.first {
            cacheOrder.removeFirst()
            plaintextCache.removeValue(forKey: oldest)
        }
    }

    /// 锁屏 / 退到后台时清空明文缓存（安全要求）
    public func clearPlaintextCache() {
        plaintextCache.removeAll()
        cacheOrder.removeAll()
    }
}
