//
//  DeepLinkTests.swift
//  CloudClipboardTests
//
//  Deep Link / Universal Link / 通知跳转 / Quick Action 路由解析。
//

import XCTest
@testable import CloudClipboard

@MainActor
final class DeepLinkTests: XCTestCase {

    // MARK: Custom URL Scheme

    func testClipboardCustomScheme() {
        XCTAssertEqual(
            DeepLinkRouter.route(for: URL(string: "cloudclipboard://clipboard/abc-123")!),
            .clipboardDetail(id: "abc-123")
        )
    }

    func testClipboardCustomSchemeWithoutID() {
        XCTAssertEqual(DeepLinkRouter.route(for: URL(string: "cloudclipboard://clipboard")!), .clipboardList)
    }

    func testSearchCustomScheme() {
        XCTAssertEqual(
            DeepLinkRouter.route(for: URL(string: "cloudclipboard://search?q=ssh")!),
            .search(query: "ssh")
        )
    }

    func testSearchCustomSchemeWithoutQuery() {
        XCTAssertEqual(DeepLinkRouter.route(for: URL(string: "cloudclipboard://search")!), .search(query: nil))
    }

    func testNewAndSettingsRoutes() {
        XCTAssertEqual(DeepLinkRouter.route(for: URL(string: "cloudclipboard://new")!), .newClipboard)
        XCTAssertEqual(DeepLinkRouter.route(for: URL(string: "cloudclipboard://settings")!), .settings)
        XCTAssertEqual(DeepLinkRouter.route(for: URL(string: "cloudclipboard://devices")!), .devices)
    }

    func testUnknownCustomSchemeHostReturnsNil() {
        XCTAssertNil(DeepLinkRouter.route(for: URL(string: "cloudclipboard://unknown/x")!))
    }

    // MARK: Universal Links

    func testUniversalLinkShortForm() {
        XCTAssertEqual(
            DeepLinkRouter.route(for: URL(string: "https://clip.0272.de5.net/c/xyz789")!),
            .clipboardDetail(id: "xyz789")
        )
    }

    func testUniversalLinkLongForm() {
        XCTAssertEqual(
            DeepLinkRouter.route(for: URL(string: "https://clip.0272.de5.net/clipboard/xyz789")!),
            .clipboardDetail(id: "xyz789")
        )
    }

    func testUniversalLinkSearch() {
        XCTAssertEqual(
            DeepLinkRouter.route(for: URL(string: "https://clip.0272.de5.net/search?q=github")!),
            .search(query: "github")
        )
    }

    func testUniversalLinkListWhenNoID() {
        XCTAssertEqual(DeepLinkRouter.route(for: URL(string: "https://clip.0272.de5.net/c")!), .clipboardList)
    }

    func testForeignHostStillRoutesByPath() {
        // 路径形态明确时也应可用（例如未来迁移域名）
        XCTAssertEqual(
            DeepLinkRouter.route(for: URL(string: "https://another.example.com/c/abc")!),
            .clipboardDetail(id: "abc")
        )
    }

    func testNonHTTPURLSchemeRejected() {
        XCTAssertNil(DeepLinkRouter.route(for: URL(string: "mailto:test@example.com")!))
        XCTAssertNil(DeepLinkRouter.route(for: URL(string: "file:///tmp/x")!))
    }

    func testDeepLinkGeneration() {
        XCTAssertEqual(DeepLinkRouter.customURL(for: "id-1")?.absoluteString, "cloudclipboard://clipboard/id-1")
        XCTAssertEqual(
            DeepLinkRouter.universalLink(for: "id-2")?.absoluteString,
            "https://clip.0272.de5.net/c/id-2"
        )
    }

    // MARK: 通知路由

    func testNotificationRouteParsing() {
        XCTAssertEqual(NotificationService.route(from: "clipboard/abc"), .clipboardDetail(id: "abc"))
        XCTAssertEqual(NotificationService.route(from: "clipboard"), .clipboardList)
        XCTAssertEqual(NotificationService.route(from: "devices"), .devices)
        XCTAssertEqual(NotificationService.route(from: "settings"), .settings)
        XCTAssertEqual(NotificationService.route(from: "something-else"), .clipboardList)
    }

    // MARK: Quick Actions

    func testQuickActionRoutes() {
        XCTAssertEqual(QuickAction.newClipboard.route, .newClipboard)
        XCTAssertEqual(QuickAction.search.route, .search(query: nil))
        XCTAssertEqual(QuickAction.latest.route, .clipboardList)
        XCTAssertEqual(QuickAction.settings.route, .settings)
    }

    func testQuickActionRawValuesMatchInfoPlist() {
        // 必须与 CloudClipboard/Resources/Info.plist 的 UIApplicationShortcutItemType 一致
        XCTAssertEqual(QuickAction.newClipboard.rawValue, "de.cloudclipboard.ios.dev.quickaction.new")
        XCTAssertEqual(QuickAction.search.rawValue, "de.cloudclipboard.ios.dev.quickaction.search")
        XCTAssertEqual(QuickAction.latest.rawValue, "de.cloudclipboard.ios.dev.quickaction.latest")
        XCTAssertEqual(QuickAction.settings.rawValue, "de.cloudclipboard.ios.dev.quickaction.settings")
    }
}
