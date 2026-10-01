//
//  SpotlightIndexer.swift
//  CloudClipboard
//
//  CoreSpotlight 集成。
//
//  隐私默认值：**关闭**。
//  剪贴板内容常含密码/验证码，默认索引到 Spotlight 会泄露到锁屏搜索。
//  用户主动在「设置 → 隐私 → Spotlight 搜索」开启后才索引，
//  且只索引已解密文本的前 120 个字符；关闭时立即清除全部索引。
//

import Foundation
import CoreSpotlight
import MobileCoreServices
import UniformTypeIdentifiers

public struct SpotlightItem: Sendable {
    public let id: String
    public let title: String
    public let snippet: String
    public let createdAt: Date

    public init(id: String, title: String, snippet: String, createdAt: Date) {
        self.id = id
        self.title = title
        self.snippet = snippet
        self.createdAt = createdAt
    }
}

public protocol SpotlightIndexing: Sendable {
    func index(_ items: [SpotlightItem]) async
    func remove(ids: [String]) async
    func removeAll() async
}

public struct SpotlightIndexer: SpotlightIndexing {
    /// 索引时最多截取多少字符（避免全文进 Spotlight）
    public static let maxSnippetLength = 120

    public init() {}

    public func index(_ items: [SpotlightItem]) async {
        guard !items.isEmpty else { return }

        let searchableItems = items.map { item -> CSSearchableItem in
            let attributes = CSSearchableItemAttributeSet(contentType: .text)
            attributes.title = item.title
            attributes.contentDescription = item.snippet
            attributes.contentCreationDate = item.createdAt
            attributes.keywords = ["CloudClipboard", "剪贴板"]

            return CSSearchableItem(
                uniqueIdentifier: Self.identifier(for: item.id),
                domainIdentifier: Self.domainIdentifier,
                attributeSet: attributes
            )
        }

        do {
            try await CSSearchableIndex.default().indexSearchableItems(searchableItems)
        } catch {
            AppLog.storage.info("Spotlight 索引失败: \(error.localizedDescription, privacy: .public)")
        }
    }

    public func remove(ids: [String]) async {
        let identifiers = ids.map(Self.identifier(for:))
        do {
            try await CSSearchableIndex.default().deleteSearchableItems(withIdentifiers: identifiers)
        } catch {
            AppLog.storage.info("Spotlight 删除失败: \(error.localizedDescription, privacy: .public)")
        }
    }

    public func removeAll() async {
        do {
            try await CSSearchableIndex.default().deleteSearchableItems(withDomainIdentifiers: [Self.domainIdentifier])
        } catch {
            AppLog.storage.info("Spotlight 清空失败: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Spotlight 回调里带的 identifier → 条目 id
    public static func identifier(for id: String) -> String {
        "\(domainIdentifier).\(id)"
    }

    public static func clipboardID(fromIdentifier identifier: String) -> String? {
        guard identifier.hasPrefix("\(domainIdentifier).") else { return nil }
        return String(identifier.dropFirst(domainIdentifier.count + 1))
    }

    public static let domainIdentifier = "de.cloudclipboard.ios.items"
}
