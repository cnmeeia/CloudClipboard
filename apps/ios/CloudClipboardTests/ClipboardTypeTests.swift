//
//  ClipboardTypeTests.swift
//  CloudClipboardTests
//

import XCTest
@testable import CloudClipboard

final class ClipboardTypeTests: XCTestCase {
    func testDecodesServerTypeStrings() throws {
        for raw in ["text", "url", "code", "image", "file"] {
            XCTAssertEqual(ClipboardType(rawValue: raw)?.rawValue, raw)
        }
    }

    func testTypeInference() {
        XCTAssertEqual(ClipboardType.infer(from: "https://example.com/x?a=1"), .url)
        XCTAssertEqual(ClipboardType.infer(from: "http://localhost:5173"), .url)
        XCTAssertEqual(ClipboardType.infer(from: "const x = 1"), .code)
        XCTAssertEqual(ClipboardType.infer(from: "function hello() {}"), .code)
        XCTAssertEqual(ClipboardType.infer(from: "SELECT * FROM users"), .code)
        XCTAssertEqual(ClipboardType.infer(from: "just a normal sentence"), .text)
        XCTAssertEqual(ClipboardType.infer(from: "not a url with https:// inside"), .text)
    }

    func testContentRendererDetectsColor() {
        XCTAssertNotNil(ContentRenderer.Kind.parseColor("#fff"))
        XCTAssertNotNil(ContentRenderer.Kind.parseColor("#a1b2c3"))
        XCTAssertNotNil(ContentRenderer.Kind.parseColor("rgb(10, 20, 30)"))
        XCTAssertNil(ContentRenderer.Kind.parseColor("#xyz"))
        XCTAssertNil(ContentRenderer.Kind.parseColor("no-color"))
    }

    func testContentRendererDetectsOTP() {
        XCTAssertEqual(ContentRenderer.Kind.detect("123456", declared: .text), .otp)
        XCTAssertEqual(ContentRenderer.Kind.detect("12345678", declared: .text), .otp)
        XCTAssertEqual(ContentRenderer.Kind.detect("123456789", declared: .text), .text)
    }

    func testContentRendererDetectsJSON() {
        XCTAssertEqual(ContentRenderer.Kind.detect(#"{"a":1}"#, declared: .text), .json)
        XCTAssertEqual(ContentRenderer.Kind.detect("[1,2,3]", declared: .text), .json)
        XCTAssertEqual(ContentRenderer.Kind.detect("{not json}", declared: .text), .text)
    }
}

final class DateFormattingTests: XCTestCase {
    func testSectionTitles() {
        let now = Date()
        XCTAssertEqual(ClipboardDateFormatting.sectionTitle(for: now), "今天")
        XCTAssertEqual(ClipboardDateFormatting.sectionTitle(for: now.addingTimeInterval(-86_400)), "昨天")
        XCTAssertEqual(ClipboardDateFormatting.sectionTitle(for: now.addingTimeInterval(-3 * 86_400)), "本周")
        XCTAssertEqual(ClipboardDateFormatting.sectionTitle(for: now.addingTimeInterval(-10 * 86_400)), "本月")
        XCTAssertEqual(ClipboardDateFormatting.sectionTitle(for: now.addingTimeInterval(-90 * 86_400)), "更早")
    }

    func testRelativeFormatting() {
        let now = Date()
        XCTAssertEqual(ClipboardDateFormatting.relative(for: now.addingTimeInterval(-10)), "刚刚")
        XCTAssertEqual(ClipboardDateFormatting.relative(for: now.addingTimeInterval(-300)), "5 分钟前")
    }

    func testExpiryFormatting() {
        XCTAssertEqual(ClipboardDateFormatting.expiry(for: nil), "永久")
        XCTAssertEqual(ClipboardDateFormatting.expiry(for: Date().addingTimeInterval(-10)), "已过期")
        XCTAssertEqual(ClipboardDateFormatting.expiry(for: Date().addingTimeInterval(3600)), "1 小时后过期")
        XCTAssertEqual(ClipboardDateFormatting.expiry(for: Date().addingTimeInterval(86_400 * 3)), "3 天后过期")
    }
}

final class WidgetPayloadTests: XCTestCase {
    func testWidgetItemEncodesAndLinks() throws {
        let item = WidgetItem(
            id: "abc",
            title: "Hello World",
            subtitle: "iPhone · 刚刚",
            typeSystemImage: "text.alignleft"
        )
        XCTAssertEqual(item.deepLink?.absoluteString, "cloudclipboard://clipboard/abc")

        let data = try JSONEncoder().encode([item])
        let decoded = try JSONDecoder().decode([WidgetItem].self, from: data)
        XCTAssertEqual(decoded, [item])
    }

    func testSpotlightIdentifierRoundTrip() {
        let id = "clip-123"
        let identifier = SpotlightIndexer.identifier(for: id)
        XCTAssertEqual(SpotlightIndexer.clipboardID(fromIdentifier: identifier), id)
        XCTAssertNil(SpotlightIndexer.clipboardID(fromIdentifier: "other.domain.123"))
    }

    func testSpotlightSnippetIsTruncated() {
        let long = String(repeating: "a", count: 500)
        XCTAssertEqual(SpotlightIndexer.maxSnippetLength, 120)
        XCTAssertEqual(String(long.prefix(SpotlightIndexer.maxSnippetLength)).count, 120)
    }
}

final class BackgroundTaskIdentifierTests: XCTestCase {
    func testIdentifiersMatchInfoPlist() {
        // 必须与 CloudClipboard/Resources/Info.plist 的 BGTaskSchedulerPermittedIdentifiers 一致
        XCTAssertEqual(BackgroundTaskScheduler.refreshIdentifier, "de.cloudclipboard.ios.dev.refresh")
        XCTAssertEqual(BackgroundTaskScheduler.processingIdentifier, "de.cloudclipboard.ios.dev.processing")
    }
}

final class SharedSettingsTests: XCTestCase {
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: "test.settings.\(UUID().uuidString)")
    }

    func testDefaultWorkerURLMatchesProductionDomain() {
        let settings = SharedSettings(defaults: defaults)
        XCTAssertEqual(settings.workerURL, "https://clip.0272.de5.net")
    }

    func testThemeRoundTrip() {
        let settings = SharedSettings(defaults: defaults)
        settings.theme = .dark
        XCTAssertEqual(SharedSettings(defaults: defaults).theme, .dark)
    }

    func testBiometricPolicyRoundTrip() {
        let settings = SharedSettings(defaults: defaults)
        settings.biometricPolicy = .after5Minute
        XCTAssertEqual(SharedSettings(defaults: defaults).biometricPolicy, .after5Minute)
        XCTAssertEqual(BiometricPolicy.after5Minute.graceInterval, 300)
        XCTAssertNil(BiometricPolicy.never.graceInterval)
    }

    func testTTLDefaultsToNilMeaningPermanent() {
        let settings = SharedSettings(defaults: defaults)
        XCTAssertNil(settings.uploadTTLMs)
        settings.uploadTTLMs = 3_600_000
        XCTAssertEqual(SharedSettings(defaults: defaults).uploadTTLMs, 3_600_000)
    }

    func testBiometricPolicyTitles() {
        XCTAssertEqual(BiometricPolicy.never.title, "从不")
        XCTAssertEqual(BiometricPolicy.immediately.graceInterval, 0)
        XCTAssertEqual(BiometricPolicy.after1Minute.graceInterval, 60)
    }
}

final class EndpointsTests: XCTestCase {
    func testAllPathsMatchWorkerRoutes() {
        XCTAssertEqual(Endpoints.health().path, "/api/health")
        XCTAssertEqual(Endpoints.health().requiresAuth, false)
        XCTAssertEqual(Endpoints.me().path, "/api/me")
        XCTAssertEqual(Endpoints.getPrefs().path, "/api/prefs")
        XCTAssertEqual(Endpoints.listDevices().path, "/api/devices")
        XCTAssertEqual(Endpoints.registerDevice(body: Data()).path, "/api/devices/register")
        XCTAssertEqual(Endpoints.listClipboard(limit: 10).path, "/api/clipboard")
        XCTAssertEqual(Endpoints.listClipboard(limit: 10).query["limit"], "10")
        XCTAssertEqual(Endpoints.createClipboard(body: Data()).path, "/api/clipboard")
        XCTAssertEqual(Endpoints.getClipboard(id: "a b").path, "/api/clipboard/a%20b")
        XCTAssertEqual(Endpoints.deleteClipboard(id: "x").method, .delete)
        XCTAssertEqual(Endpoints.pushTest(body: Data()).path, "/api/push/test")
        XCTAssertEqual(Endpoints.listTokens().path, "/api/tokens")
        XCTAssertEqual(Endpoints.revokeToken(id: "t1").path, "/api/tokens/t1")
    }

    func testDefaultDeviceTypeIsAllowedByServerSchema() {
        // registerDeviceSchema 只接受 pwa | cli | extension | other
        let request = RegisterDeviceRequest(id: "x", name: "y")
        XCTAssertEqual(request.deviceType, "other")
        XCTAssertEqual(request.platform, "ios")
        XCTAssertTrue(["pwa", "cli", "extension", "other"].contains(request.deviceType))
    }
}
