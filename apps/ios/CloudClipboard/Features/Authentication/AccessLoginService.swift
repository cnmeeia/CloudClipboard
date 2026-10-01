//
//  AccessLoginService.swift
//  CloudClipboard
//
//  Cloudflare Access 浏览器登录：
//    1. ASWebAuthenticationSession 打开 https://<host>/api/auth/done
//       （该域名受 Cloudflare Access 保护）
//    2. 用户在系统浏览器里完成 Access 登录（Passkey / 邮箱验证码 / SSO 等）
//    3. Access 放行后，Worker 302 跳到 cloudclipboard://access-auth，
//       会话自动关闭；若 Worker 还没部署该路由，用户手动点「完成」关闭即可
//    4. 从共享 Cookie（CF_Authorization）取出 JWT 返回给调用方
//
//  注意：必须用非 ephemeral 会话，Cookie 才会写入共享 HTTPCookieStorage，
//  后续 API 请求才能自动带上它通过边缘 Access。
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
            ) { [weak self] _, _ in
                // 无论自动回调还是用户手动关闭，都以 Cookie 为准：
                // 有 JWT 即成功，没有则视为取消/失败
                Task { @MainActor [weak self] in
                    self?.currentSession = nil
                    if let jwt = Self.jwtFromSharedCookie(host: host), !jwt.isEmpty {
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

    /// 从共享 Cookie 读取 CF_Authorization（即 Access JWT）
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
