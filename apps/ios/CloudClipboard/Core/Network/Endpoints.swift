//
//  Endpoints.swift
//  CloudClipboard
//
//  把所有 API 端点收敛到这里，与 `apps/worker/src/index.ts` 的路由逐一对应。
//  禁止在别处拼字符串路径（避免出现不存在的 API）。
//

import Foundation

public enum Endpoints {
    /// GET /api/health — 公开
    public static func health() -> APIRequest {
        APIRequest(method: .get, path: "/api/health", requiresAuth: false)
    }

    /// GET /api/me → { user: { id } }（PBKDF2 盐 = "cloudclipboard:v1:" + userId）
    public static func me() -> APIRequest {
        APIRequest(method: .get, path: "/api/me")
    }

    // MARK: Prefs

    public static func getPrefs() -> APIRequest {
        APIRequest(method: .get, path: "/api/prefs")
    }

    public static func updatePrefs(body: Data) -> APIRequest {
        APIRequest(method: .put, path: "/api/prefs", body: body)
    }

    // MARK: Devices

    public static func listDevices() -> APIRequest {
        APIRequest(method: .get, path: "/api/devices")
    }

    /// POST /api/devices/register（upsert，幂等）
    /// device_type 仅允许 pwa | cli | extension | other → iOS 传 "other"
    public static func registerDevice(body: Data) -> APIRequest {
        APIRequest(method: .post, path: "/api/devices/register", body: body)
    }

    public static func updateDevice(id: String, body: Data) -> APIRequest {
        APIRequest(method: .patch, path: "/api/devices/\(escape(id))", body: body)
    }

    public static func deleteDevice(id: String) -> APIRequest {
        APIRequest(method: .delete, path: "/api/devices/\(escape(id))")
    }

    public static func pushTest(body: Data) -> APIRequest {
        APIRequest(method: .post, path: "/api/push/test", body: body)
    }

    // MARK: Clipboard

    /// GET /api/clipboard?limit=n — 服务端 clamp 到 1...200
    public static func listClipboard(limit: Int) -> APIRequest {
        APIRequest(method: .get, path: "/api/clipboard", query: ["limit": String(limit)])
    }

    public static func createClipboard(body: Data) -> APIRequest {
        APIRequest(method: .post, path: "/api/clipboard", body: body)
    }

    public static func getClipboard(id: String) -> APIRequest {
        APIRequest(method: .get, path: "/api/clipboard/\(escape(id))")
    }

    public static func deleteClipboard(id: String) -> APIRequest {
        APIRequest(method: .delete, path: "/api/clipboard/\(escape(id))")
    }

    // MARK: API Tokens

    public static func listTokens() -> APIRequest {
        APIRequest(method: .get, path: "/api/tokens")
    }

    public static func createToken(body: Data) -> APIRequest {
        APIRequest(method: .post, path: "/api/tokens", body: body)
    }

    public static func revokeToken(id: String) -> APIRequest {
        APIRequest(method: .delete, path: "/api/tokens/\(escape(id))")
    }

    // MARK: Files（R2）

    public static func uploadFile(body: Data, query: [String: String]) -> APIRequest {
        APIRequest(method: .post, path: "/api/files/upload", query: query, body: body)
    }

    public static func getFile(key: String) -> APIRequest {
        APIRequest(method: .get, path: "/api/files/\(escape(key))")
    }

    /// 路径段转义（id / r2 key 可能含特殊字符）
    private static func escape(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? value
    }
}
