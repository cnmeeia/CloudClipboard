//
//  AuthRepository.swift
//  CloudClipboard
//
//  认证与主密钥管理。
//
//  认证方式（见 docs/ios-audit.md §2）：API Token（Bearer cca_...）
//    - Token 存 Keychain
//    - 启动时用 GET /api/me 校验有效性并取回 userId
//    - userId 是 PBKDF2 盐的一部分，必须与 Web 端一致
//

import Foundation

public enum AuthState: Sendable, Equatable {
    /// 尚未配置（缺 Token 或 Worker URL）
    case unconfigured
    /// 已配置，但缺少种子短语（无法解密）
    case needsSeedPhrase(userId: String)
    /// 完全就绪
    case ready(userId: String)
    /// Token 失效
    case expired(String)
}

@MainActor
@Observable
public final class AuthRepository {
    public private(set) var state: AuthState = .unconfigured
    public private(set) var isBusy = false
    public private(set) var lastError: String?

    private let apiClient: APIClientProtocol
    private let keychain: KeychainServiceProtocol
    private let crypto: CryptoServiceProtocol
    private let settings: SharedSettings

    /// 内存中的主密钥（不落盘；落盘的是种子短语，在 Keychain 里）
    private var masterKeyCache: SymmetricKey?

    public init(
        apiClient: APIClientProtocol,
        keychain: KeychainServiceProtocol,
        crypto: CryptoServiceProtocol,
        settings: SharedSettings = SharedSettings()
    ) {
        self.apiClient = apiClient
        self.keychain = keychain
        self.crypto = crypto
        self.settings = settings
    }

    public var hasToken: Bool {
        !(keychain.get(.apiToken) ?? "").isEmpty
    }

    public var userId: String? {
        keychain.get(.userId)
    }

    /// 启动引导：校验 Token → 取 userId → 检查种子短语
    public func bootstrap() async {
        guard hasToken else {
            state = .unconfigured
            return
        }
        await refreshIdentity()
    }

    /// 校验 Token 并同步 userId
    public func refreshIdentity() async {
        isBusy = true
        defer { isBusy = false }
        do {
            let response = try await apiClient.send(Endpoints.me(), as: MeResponse.self)
            let remoteUserId = response.user.id

            // 换账号检测：本地缓存的 userId 与服务端不一致时，必须清掉主密钥缓存，
            // 否则会用错误的盐派生 key，表现为「所有条目都解不开」。
            if let cached = keychain.get(.userId), cached != remoteUserId {
                AppLog.security.info("检测到账号切换，清理本地密钥缓存")
                masterKeyCache = nil
                keychain.remove(.seedPhrase)
                keychain.remove(.masterKey)
            }
            try? keychain.set(remoteUserId, for: .userId)

            if keychain.get(.seedPhrase) != nil {
                state = .ready(userId: remoteUserId)
            } else {
                state = .needsSeedPhrase(userId: remoteUserId)
            }
            lastError = nil
        } catch let error as APIError {
            if error.requiresReauthentication {
                state = .expired(error.localizedDescription)
            } else {
                lastError = error.localizedDescription
                if let cachedUserId = keychain.get(.userId) {
                    state = .needsSeedPhrase(userId: cachedUserId)
                } else {
                    state = .unconfigured
                }
            }
        } catch {
            lastError = "无法连接服务器"
        }
    }

    /// 登录：写入 Token + Worker URL，随后校验身份
    public func signIn(workerURL: String, apiToken: String) async {
        let normalizedURL = workerURL.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedToken = apiToken.trimmingCharacters(in: .whitespacesAndNewlines)

        settings.workerURL = normalizedURL
        try? keychain.set(normalizedToken, for: .apiToken)
        await refreshIdentity()
    }

    /// 设置/更新种子短语并派生主密钥
    @discardableResult
    public func setSeedPhrase(_ phrase: String) -> Bool {
        guard let userId = keychain.get(.userId) else {
            lastError = "请先完成登录"
            return false
        }
        do {
            let key = try crypto.deriveMasterKey(seedPhrase: phrase, userId: userId)
            try keychain.set(phrase.trimmingCharacters(in: .whitespacesAndNewlines), for: .seedPhrase)
            masterKeyCache = key
            state = .ready(userId: userId)
            lastError = nil
            return true
        } catch {
            lastError = (error as? LocalizedError)?.errorDescription ?? "密钥派生失败"
            return false
        }
    }

    /// 取主密钥：优先内存缓存 → Keychain 种子短语重新派生
    public func masterKey() throws -> SymmetricKey {
        if let masterKeyCache { return masterKeyCache }
        guard let userId = keychain.get(.userId) else {
            throw APIError.sessionExpired("尚未完成登录")
        }
        guard let phrase = keychain.get(.seedPhrase) else {
            throw CryptoError.emptySeedPhrase
        }
        let key = try crypto.deriveMasterKey(seedPhrase: phrase, userId: userId)
        masterKeyCache = key
        return key
    }

    /// 退出登录：清 Keychain、清共享配置
    public func signOut() {
        keychain.removeAll()
        masterKeyCache = nil
        state = .unconfigured
    }

    /// 校验种子短语是否正确（用已有条目试解密由上层做，这里只做派生并缓存）
    public func validateSeedPhrase(_ phrase: String) -> Bool {
        guard let userId = keychain.get(.userId) else { return false }
        return (try? crypto.deriveMasterKey(seedPhrase: phrase, userId: userId)) != nil
    }
}

public extension AuthState {
    /// 是否已完全就绪（可加解密、可同步）
    var isReady: Bool {
        if case .ready = self { return true }
        return false
    }
}
