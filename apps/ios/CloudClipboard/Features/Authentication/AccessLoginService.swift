//
//  AccessLoginService.swift
//  CloudClipboard
//
//  Cloudflare Access 浏览器登录（系统 Safari 方案）：
//    1. App 用 UIApplication.shared.open 打开 https://<host>/api/auth/done
//       （该域名受 Cloudflare Access 保护）
//    2. 用户在系统 Safari 里完成 Access 登录（Safari 里 Access 页面正常）
//    3. Access 放行后，Worker 302 跳到 cloudclipboard://access-auth#token=<JWT>
//    4. iOS 通过 URL Scheme 打开 App，onOpenURL 收到回调
//    5. AccessLoginService.handleCallback 解析出 JWT，完成登录
//
//  为什么不用 ASWebAuthenticationSession：
//  Cloudflare Access 的登录页在内嵌浏览器里加载空白，无法完成登录。
//  系统 Safari 是唯一可靠的路径。
//
//  为什么不用 Cookie：
//  Safari 的 Cookie App 读不到，唯一的可靠通道是回调 URL 的 fragment。
//

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
public final class AccessLoginService {
    // 静态存储：signIn 可能由任意实例调用，回调由 App 统一入口处理，
    // 用静态存储桥接，避免单例改造调用点。
    private static var pendingContinuation: CheckedContinuation<String, Error>?
    private static var timeoutTask: Task<Void, Never>?

    public init() {}

    /// 在 baseURL 的 host 上完成 Access 登录，返回 JWT。
    /// 会在系统 Safari 打开登录页，等待 Worker 回调。
    public func signIn(baseURL: URL) async throws -> String {
        guard let host = baseURL.host, !host.isEmpty,
              let loginURL = URL(string: "https://\(host)/api/auth/done")
        else {
            throw AccessLoginError.invalidHost
        }

        // 取消之前的挂起登录（如果有）
        Self.cancelPending()

        return try await withCheckedThrowingContinuation { continuation in
            Self.pendingContinuation = continuation

            // 5 分钟超时：用户在 Safari 放弃或关闭后回 App，视为取消
            Self.timeoutTask = Task { @MainActor in
                try? await Task.sleep(nanoseconds: 5 * 60 * 1_000_000_000)
                if Self.pendingContinuation != nil {
                    Self.pendingContinuation?.resume(throwing: AccessLoginError.cancelled)
                    Self.pendingContinuation = nil
                }
            }

            // 在系统 Safari 打开（Access 登录页在 Safari 里正常）
            UIApplication.shared.open(loginURL)
        }
    }

    /// 处理 cloudclipboard://access-auth 回调（静态，App 的 onOpenURL 直接调用）。
    public static func handleCallback(url: URL) {
        timeoutTask?.cancel()
        timeoutTask = nil

        if let token = Self.tokenFromCallbackURL(url), !token.isEmpty {
            pendingContinuation?.resume(returning: token)
        } else {
            pendingContinuation?.resume(throwing: AccessLoginError.cancelled)
        }
        pendingContinuation = nil
    }

    /// 取消挂起的登录（内部使用）
    private static func cancelPending() {
        timeoutTask?.cancel()
        timeoutTask = nil
        pendingContinuation?.resume(throwing: AccessLoginError.cancelled)
        pendingContinuation = nil
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

    /// 从共享 Cookie 读取 CF_Authorization（降级兜底，大概率读不到）
    public static func jwtFromSharedCookie(host: String) -> String? {
        guard let url = URL(string: "https://\(host)") else { return nil }
        let cookies = HTTPCookieStorage.shared.cookies(for: url) ?? []
        return cookies.first(where: { $0.name == "CF_Authorization" })?.value
    }
}
