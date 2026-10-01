//
//  PrefsRepository.swift
//  CloudClipboard
//
//  用户偏好（主题 + 通知）跨设备同步。与 Web 端共用 /api/prefs。
//

import Foundation
import SwiftUI

@MainActor
@Observable
public final class PrefsRepository {
    public private(set) var theme: ThemeMode
    public private(set) var notification: NotificationPrefs
    public private(set) var lastError: String?

    private let apiClient: APIClientProtocol
    private let settings: SharedSettings
    private var isSyncing = false

    public init(apiClient: APIClientProtocol, settings: SharedSettings = SharedSettings()) {
        self.apiClient = apiClient
        self.settings = settings
        self.theme = settings.theme
        self.notification = NotificationPrefs()
    }

    public var colorScheme: ColorScheme? {
        switch theme {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }

    public func load() async {
        do {
            let response = try await apiClient.send(Endpoints.getPrefs(), as: PrefsResponse.self)
            if let remoteTheme = response.prefs.theme {
                theme = remoteTheme
                settings.theme = remoteTheme
            }
            if let remoteNotification = response.prefs.notification {
                notification = remoteNotification
            }
            lastError = nil
        } catch {
            // 偏好拉取失败不应阻塞使用：沿用本地值
            lastError = (error as? LocalizedError)?.errorDescription
        }
    }

    public func setTheme(_ newTheme: ThemeMode) async {
        theme = newTheme
        settings.theme = newTheme
        await push(UpdatePrefsRequest(theme: newTheme, notification: nil))
    }

    public func setNotification(_ prefs: NotificationPrefs) async {
        notification = prefs
        await push(UpdatePrefsRequest(theme: nil, notification: prefs))
    }

    private func push(_ request: UpdatePrefsRequest) async {
        guard !isSyncing else { return }
        isSyncing = true
        defer { isSyncing = false }
        do {
            _ = try await apiClient.send(
                Endpoints.updatePrefs(body: try JSONEncoder().encode(request)),
                as: PrefsResponse.self
            )
        } catch {
            lastError = (error as? LocalizedError)?.errorDescription
        }
    }
}
