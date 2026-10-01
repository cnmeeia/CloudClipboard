//
//  APIError.swift
//  CloudClipboard
//
//  网络/接口错误的统一表示。所有错误都要能转换成人能读懂的提示，
//  绝不把 `URLError(-1009)` 这类原始码直接甩给用户。
//

import Foundation

public enum APIError: Error, LocalizedError, Equatable {
    /// 未配置 Worker URL 或 Token
    case notConfigured
    /// 离线 / 网络不可达
    case offline
    /// 请求超时
    case timeout
    /// 会话失效（401 / UNAUTHORIZED / SESSION_EXPIRED）→ 需要重新输入 Token
    case sessionExpired(String)
    /// 权限不足（403）
    case forbidden(String)
    /// 触发限流（429），带 Retry-After
    case rateLimited(retryAfter: TimeInterval?)
    /// 服务端 5xx
    case serverError(status: Int, message: String)
    /// 业务错误（4xx，含 code）
    case api(code: String, message: String, status: Int)
    /// 响应不是合法 JSON
    case invalidResponse(status: Int)
    /// 请求被 Cloudflare Access 在边缘拦截（返回了登录页 HTML）
    /// → 需要用户完成 Access 登录（或检查服务器地址是否填的是受 Access 保护的域名）
    case accessChallenge
    /// 其他
    case transport(String)

    public var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "还没有配置服务器或访问令牌，请到「设置」完成初始化"
        case .offline:
            return "网络不可用，正在等待网络恢复……"
        case .timeout:
            return "网络较慢，请求超时了，请重试"
        case .sessionExpired(let message):
            return message.isEmpty ? "登录已过期，请重新输入访问令牌" : message
        case .forbidden(let message):
            return message.isEmpty ? "没有权限访问该资源" : message
        case .rateLimited(let retryAfter):
            if let retryAfter {
                return "操作太频繁了，请 \(Int(retryAfter.rounded())) 秒后重试"
            }
            return "操作太频繁了，请稍后重试"
        case .serverError(_, let message):
            return message.isEmpty ? "服务器暂时不可用，请稍后重试" : message
        case .api(_, let message, _):
            return message
        case .invalidResponse(let status):
            return "服务器返回了无法解析的数据（HTTP \(status)）"
        case .accessChallenge:
            return "请求被 Cloudflare Access 拦截，请先完成 Access 登录验证"
        case .transport(let message):
            return message
        }
    }

    /// 是否可以通过重试解决（离线 / 超时 / 5xx / 429）
    public var isRetryable: Bool {
        switch self {
        case .offline, .timeout, .serverError, .rateLimited, .transport:
            return true
        case .notConfigured, .sessionExpired, .forbidden, .api, .invalidResponse, .accessChallenge:
            return false
        }
    }

    /// 是否应触发「重新登录」引导
    public var requiresReauthentication: Bool {
        if case .sessionExpired = self { return true }
        if case .accessChallenge = self { return true }
        return false
    }

    /// 从 URLError 映射（避免把 -1009 暴露给用户）
    public static func from(_ urlError: URLError) -> APIError {
        switch urlError.code {
        case .notConnectedToInternet, .networkConnectionLost, .dataNotAllowed,
             .cannotConnectToHost, .cannotFindHost, .internationalRoamingOff:
            return .offline
        case .timedOut:
            return .timeout
        case .secureConnectionFailed, .serverCertificateUntrusted, .serverCertificateHasBadDate,
             .serverCertificateNotYetValid, .serverCertificateHasUnknownRoot:
            return .transport("无法建立安全连接，请检查证书或网络环境")
        case .cancelled:
            return .transport("请求已取消")
        default:
            return .offline
        }
    }
}
