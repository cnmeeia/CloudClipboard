//
//  DeepLinkRouter.swift
//  CloudClipboard
//
//  统一处理 Custom URL Scheme 与 Universal Links。
//
//    cloudclipboard://clipboard/{id}    → 打开条目详情
//    cloudclipboard://search?q=xxx      → 打开搜索
//    cloudclipboard://new               → 新建（推送当前剪贴板）
//    cloudclipboard://settings          → 设置
//    https://clip.0272.de5.net/c/{id}   → Universal Link，等同 clipboard/{id}
//    https://{host}/clipboard/{id}      → 备用形态
//

import Foundation

public enum AppRoute: Equatable, Sendable {
    case clipboardList
    case clipboardDetail(id: String)
    case search(query: String?)
    case newClipboard
    case settings
    case devices
}

public enum DeepLinkRouter {
    public static let scheme = "cloudclipboard"

    /// 解析 URL。返回 nil 表示不是本 App 能识别的链接。
    public static func route(for url: URL) -> AppRoute? {
        if url.scheme?.lowercased() == scheme {
            return routeForCustomScheme(url)
        }
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else {
            return nil
        }
        return routeForUniversalLink(url)
    }

    private static func routeForCustomScheme(_ url: URL) -> AppRoute? {
        // cloudclipboard://clipboard/{id} → host = "clipboard", path = "/{id}"
        let host = url.host?.lowercased() ?? ""
        let components = url.pathComponents.filter { $0 != "/" }

        switch host {
        case "clipboard":
            if let id = components.first, !id.isEmpty {
                return .clipboardDetail(id: id)
            }
            return .clipboardList
        case "search":
            let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "q" })?.value
            return .search(query: query)
        case "new":
            return .newClipboard
        case "settings":
            return .settings
        case "devices":
            return .devices
        default:
            return nil
        }
    }

    /// Universal Link：/c/{id} 与 /clipboard/{id}
    private static func routeForUniversalLink(_ url: URL) -> AppRoute? {
        let components = url.pathComponents.filter { $0 != "/" }
        guard let first = components.first?.lowercased() else { return nil }

        switch first {
        case "c", "clipboard":
            guard components.count >= 2 else { return .clipboardList }
            return .clipboardDetail(id: components[1])
        case "search":
            let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "q" })?.value
            return .search(query: query)
        case "settings":
            return .settings
        default:
            return nil
        }
    }

    /// 用于生成分享/通知里的深链
    public static func customURL(for id: String) -> URL? {
        URL(string: "\(scheme)://clipboard/\(id)")
    }

    /// 给 Web 端用的 Universal Link（与 Worker 的自定义域一致）
    public static func universalLink(for id: String, host: String = "clip.0272.de5.net") -> URL? {
        URL(string: "https://\(host)/c/\(id)")
    }
}
