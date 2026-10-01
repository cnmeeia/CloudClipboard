//
//  TokenRepository.swift
//  CloudClipboard
//
//  API Token 管理（用于在其他设备/CLI 上接入）。
//  明文 token 仅创建时返回一次，立刻写入 Keychain 供本机使用。
//

import Foundation

@MainActor
@Observable
public final class TokenRepository {
    public private(set) var tokens: [ApiTokenDTO] = []
    public private(set) var isLoading = false
    public private(set) var lastError: String?
    /// 仅创建时短暂持有（用于展示给用户复制）
    public private(set) var newlyCreatedToken: String?

    private let apiClient: APIClientProtocol

    public init(apiClient: APIClientProtocol) {
        self.apiClient = apiClient
    }

    public func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let response = try await apiClient.send(Endpoints.listTokens(), as: TokenListResponse.self)
            tokens = response.tokens
            lastError = nil
        } catch {
            lastError = (error as? LocalizedError)?.errorDescription ?? "无法加载令牌列表"
        }
    }

    @discardableResult
    public func create(name: String) async -> String? {
        do {
            let body = CreateTokenRequest(name: name)
            let response = try await apiClient.send(
                Endpoints.createToken(body: try JSONEncoder().encode(body)),
                as: TokenCreateResponse.self
            )
            newlyCreatedToken = response.token.apiToken
            await load()
            return response.token.apiToken
        } catch {
            lastError = (error as? LocalizedError)?.errorDescription ?? "创建令牌失败"
            return nil
        }
    }

    public func revoke(_ id: String) async {
        do {
            _ = try await apiClient.send(Endpoints.revokeToken(id: id))
            tokens.removeAll { $0.id == id }
        } catch {
            lastError = (error as? LocalizedError)?.errorDescription ?? "吊销令牌失败"
        }
    }

    public func clearNewlyCreated() {
        newlyCreatedToken = nil
    }
}
