//
//  AuthRepository.swift
//  CloudClipboard
//
//  认证与主密钥管理。
//
//  认证方式（见 docs/ios-audit.md §2），两个入口：
//    1. Cloudflare Access 登录：系统浏览器走 Access 登录页，App 从
//       CF_Authorization cookie 取 JWT，以 Cf-Access-Jwt-Assertion 头调用 API
//    2. API Token：Bearer cca_...（Web 端「设置 → API Token」生成）
//  凭证都存 Keychain；userId 始终从服务端 /api/me 取回（与 Web 端一致，E2EE 互通）。
//

import Foundation
import CryptoKit
import CloudClipboardShared

/// 登录方式（两个入口）
public enum AuthMethod: String, Sendable {
    /// Cloudflare Access 浏览器登录
    case access
    /// 手动粘贴 API Token
    case token

    public var displayName: String {
        switch self {
        case .access: return "Cloudflare Access"
        case .token: return "API 令牌"
        }
    }
}

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

    public var hasAccessJwt: Bool {
        !(keychain.get(.accessJwt) ?? "").isEmpty
    }

    /// 任一凭证可用
    public var hasCredentials: Bool {
        hasToken || hasAccessJwt
    }

    /// 当前登录方式（上次主动选择的入口）
    public var method: AuthMethod {
        AuthMethod(rawValue: keychain.get(.authMethod) ?? "") ?? (hasAccessJwt ? .access : .token)
    }

    /// 上次身份校验是否被 Cloudflare Access 拦截（无有效会话）。
    /// 为 true 时，上层应引导用户走一次浏览器 Access 登录。
    public private(set) var needsAccessLogin = false

    public var userId: String? {
        keychain.get(.userId)
    }

    /// 启动引导：校验凭证 → 取 userId → 检查种子短语
    public func bootstrap() async {
        guard hasCredentials else {
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
            needsAccessLogin = false
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
            // 被 Access 拦截 → 标记，引导浏览器登录（JWT 过期/无会话）
            if case .accessChallenge = error {
                needsAccessLogin = true
            }
        } catch {
            lastError = "无法连接服务器"
        }
    }

    /// 登录（API Token 入口）：写入 Token + Worker URL。
    /// 注意：只做持久化，不校验；调用方随后按
    /// `refreshAPIConfiguration()` → `refreshIdentity()` 的顺序编排，
    /// 保证网络层先拿到最新凭证再校验（避免用过期配置）。
    public func signIn(workerURL: String, apiToken: String) {
        let normalizedURL = workerURL.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedToken = apiToken.trimmingCharacters(in: .whitespacesAndNewlines)

        settings.workerURL = normalizedURL
        try? keychain.set(normalizedToken, for: .apiToken)
        try? keychain.set(AuthMethod.token.rawValue, for: .authMethod)
    }

    /// 登录（Cloudflare Access 入口）：写入 JWT + Worker URL（同上，只持久化）
    public func signInWithAccess(workerURL: String, jwt: String) {
        let normalizedURL = workerURL.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedJwt = jwt.trimmingCharacters(in: .whitespacesAndNewlines)

        settings.workerURL = normalizedURL
        try? keychain.set(normalizedJwt, for: .accessJwt)
        try? keychain.set(AuthMethod.access.rawValue, for: .authMethod)
    }

    /// 补存 Access JWT（Token 入口被边缘 Access 拦截时，浏览器登录后调用；
    /// 不改变登录方式展示，JWT 只用于通过边缘，Worker 侧仍优先认 Token）
    public func attachAccessJwt(_ jwt: String) {
        try? keychain.set(jwt.trimmingCharacters(in: .whitespacesAndNewlines), for: .accessJwt)
        needsAccessLogin = false
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
