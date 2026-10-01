//
//  NotificationService.swift
//  CloudClipboard
//
//  本地/远程通知。要求：
//    - payload 中绝不包含剪贴板明文（服务端 Bark 推送同样不含明文）
//    - 点击通知走 Deep Link 打开对应条目
//

import Foundation
import UserNotifications
import UIKit

public enum NotificationEvent: Sendable, Equatable {
    case newClipboard(id: String?, deviceName: String)
    case syncCompleted(count: Int)
    case deviceLogin(deviceName: String)
    case securityAlert(message: String)
}

@MainActor
public final class NotificationService: NSObject, UNUserNotificationCenterDelegate {
    public static let shared = NotificationService()

    /// 通知点击后要跳转的路由
    public var onRoute: ((AppRoute) -> Void)?

    public func configure() {
        UNUserNotificationCenter.current().delegate = self
    }

    /// 请求授权（在用户明确开启通知时调用，不在启动时静默弹窗）
    @discardableResult
    public func requestAuthorization() async -> Bool {
        do {
            return try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .badge, .sound])
        } catch {
            AppLog.security.info("通知授权请求失败: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    public func authorizationStatus() async -> UNAuthorizationStatus {
        await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    }

    /// 发一条本地通知。**不要在 body 里放明文内容**。
    public func notify(_ event: NotificationEvent) async {
        let content = UNMutableNotificationContent()
        content.sound = .default

        switch event {
        case .newClipboard(let id, let deviceName):
            content.title = "新的剪贴板"
            content.body = "\(deviceName) 复制了一条内容，点按查看"
            if let id { content.userInfo["route"] = "clipboard/\(id)" }
        case .syncCompleted(let count):
            content.title = "同步完成"
            content.body = "已同步 \(count) 条记录"
            content.userInfo["route"] = "clipboard"
        case .deviceLogin(let deviceName):
            content.title = "新设备登录"
            content.body = "\(deviceName) 已连接你的 CloudClipboard"
            content.userInfo["route"] = "devices"
        case .securityAlert(let message):
            content.title = "安全提示"
            content.body = message
            content.userInfo["route"] = "settings"
        }

        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: nil
        )
        try? await UNUserNotificationCenter.current().add(request)
    }

    public func clearAll() {
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
    }

    // MARK: UNUserNotificationCenterDelegate

    public nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // 前台也展示横幅（用户可在设置里关闭）
        completionHandler([.banner, .sound, .list])
    }

    public nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        if let route = userInfo["route"] as? String {
            Task { @MainActor in
                Self.shared.onRoute?(Self.route(from: route))
            }
        }
        completionHandler()
    }

    /// 把通知里的 route 字符串（如 "clipboard/abc"）转成 AppRoute
    public static func route(from path: String) -> AppRoute {
        let components = path.split(separator: "/").map(String.init)
        switch components.first {
        case "clipboard":
            if components.count >= 2 { return .clipboardDetail(id: components[1]) }
            return .clipboardList
        case "devices":
            return .devices
        case "settings":
            return .settings
        default:
            return .clipboardList
        }
    }
}
