//
//  AccessLoginService.swift
//  CloudClipboard
//
//  Cloudflare Access 浏览器登录：
//    1. ASWebAuthenticationSession 打开 https://<host>/api/auth/done
//       （该域名受 Cloudflare Access 保护）
//    2. 用户在系统浏览器里完成 Access 登录
//    3. Access 放行后，Worker 302 跳到 cloudclipboard://access-auth#token=<JWT>，
//       会话自动关闭
//    4. App 从回调 URL 的 fragment 解析出 JWT 返回给调用方
//
//  注意：不能依赖 HTTPCookieStorage.shared 读 CF_Authorization——
//  ASWebAuthenticationSession 的 Cookie 存在 Safari 的存储里，App 读不到。
//  唯一的可靠通道是回调 URL（Worker 已把 JWT 放进 fragment）。
//

import AuthenticationServices
import Foundation
import UIKit

public enum AccessLoginError: Error, LocalizedError {
    case invalidHost
    case cancelled
    case noSession

    public var errorDescription: String? {
        switch self {
        case .invalidHost:
            return "服务器地址格式不正确"
        case .cancelled:
            return "已取消登录"
        case .noSession:
            return "未能获取到 Access 会话，请确认已在浏览器中完成登录"
        }
    }
}

@MainActor
public final class AccessLoginService: NSObject {
    private var currentSession: ASWebAuthenticationSession?

    /// 在 baseURL 的 host 上完成 Access 登录，返回 JWT（CF_Authorization cookie 的值）
    public func signIn(baseURL: URL) async throws -> String {
        guard let host = baseURL.host, !host.isEmpty,
              let loginURL = URL(string: "https://\(host)/api/auth/done")
        else {
            throw AccessLoginError.invalidHost
        }

        return try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: loginURL,
                callbackURLScheme: "cloudclipboard"
            ) { [weak self] callbackURL, _ in
                // 优先从回调 URL 解析 JWT（Worker 已把 token 放进 fragment）；
                // 拿不到则降级读共享 Cookie，最后才视为取消/失败
                Task { @MainActor [weak self] in
                    self?.currentSession = nil
                    if let url = callbackURL,
                       let token = Self.tokenFromCallbackURL(url),
                       !token.isEmpty {
                        continuation.resume(returning: token)
                    } else if let jwt = Self.jwtFromSharedCookie(host: host), !jwt.isEmpty {
                        continuation.resume(returning: jwt)
                    } else {
                        continuation.resume(throwing: AccessLoginError.cancelled)
                    }
                }
            }
            session.presentationContextProvider = self
            // 必须共享 Cookie（默认即 false，这里显式声明意图）
            session.prefersEphemeralWebBrowserSession = false
            self.currentSession = session
            session.start()
        }
    }

    /// 从回调 URL 解析 JWT：
    /// cloudclipboard://access-auth#token=<jwt>（优先，fragment 不进服务器日志）
    /// 或 cloudclipboard://access-auth?token=<jwt>（兼容）
    private static func tokenFromCallbackURL(_ url: URL) -> String? {
        if let fragment = url.fragment, !fragment.isEmpty {
            var comps = URLComponents()
            comps.query = fragment
            if let token = comps.queryItems?.first(where: { $0.name == "token" })?.value,
               !token.isEmpty {
                return token
            }
        }
        return URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?.first(where: { $0.name == "token" })?.value
    }

    /// 从共享 Cookie 读取 CF_Authorization（即 Access JWT）
    /// 注意：ASWebAuthenticationSession 的 Cookie 在 Safari 存储里，
    /// 这里大概率读不到，仅作降级兜底。
    public static func jwtFromSharedCookie(host: String) -> String? {
        guard let url = URL(string: "https://\(host)") else { return nil }
        let cookies = HTTPCookieStorage.shared.cookies(for: url) ?? []
        return cookies.first(where: { $0.name == "CF_Authorization" })?.value
    }
}

// MARK: - 弹窗锚点

extension AccessLoginService: ASWebAuthenticationPresentationContextProviding {
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        // 系统总是在主线程回调这里
        MainActor.assumeIsolated {
            UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap { $0.windows }
                .first(where: { $0.isKeyWindow }) ?? ASPresentationAnchor()
        }
    }
}