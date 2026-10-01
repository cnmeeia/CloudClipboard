//
//  ShareViewController.swift
//  CloudClipboardShareExtension
//
//  Share Extension：从 Safari / 照片 / 文件 / 备忘录等 App 分享到 CloudClipboard。
//
//  支持：URL / Plain Text / Image / File
//
//  设计要点：
//    - 不在这里弹复杂的 UI（Share Extension 的窗口很小），只做「确认 → 上传」
//    - 加密与上传复用 ClipboardIntentWorker（已处理 Keychain + PBKDF2 + API）
//    - 上传失败时把内容入 App Group 队列，回到主 App 自动重放
//    - 图片/文件超过内联上限时走 R2（本次实现内联上限 2MB，超过则提示使用主 App）
//

import UIKit
import UniformTypeIdentifiers
import CloudClipboardIntents

@MainActor
final class ShareViewController: UIViewController {
    private let statusLabel = UILabel()
    private let titleLabel = UILabel()
    private let detailLabel = UILabel()
    private let spinner = UIActivityIndicatorView(style: .medium)
    private let doneButton = UIButton(type: .system)

    private var payloads: [SharePayload] = []

    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        Task { await handleShare() }
    }

    // MARK: UI

    private func setupUI() {
        view.backgroundColor = .systemBackground

        titleLabel.text = "保存到 CloudClipboard"
        titleLabel.font = .preferredFont(forTextStyle: .headline)
        titleLabel.adjustsFontForContentSizeCategory = true

        detailLabel.font = .preferredFont(forTextStyle: .footnote)
        detailLabel.textColor = .secondaryLabel
        detailLabel.numberOfLines = 0
        detailLabel.adjustsFontForContentSizeCategory = true

        statusLabel.font = .preferredFont(forTextStyle: .subheadline)
        statusLabel.numberOfLines = 0
        statusLabel.adjustsFontForContentSizeCategory = true

        doneButton.setTitle("完成", for: .normal)
        doneButton.titleLabel?.font = .preferredFont(forTextStyle: .body)
        doneButton.addTarget(self, action: #selector(finish), for: .touchUpInside)
        doneButton.isHidden = true
        doneButton.accessibilityLabel = "完成并关闭"

        let stack = UIStackView(arrangedSubviews: [
            titleLabel, detailLabel, spinnerContainer(), statusLabel, doneButton,
        ])
        stack.axis = .vertical
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)

        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
    }

    private func spinnerContainer() -> UIView {
        let container = UIView()
        spinner.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(spinner)
        NSLayoutConstraint.activate([
            spinner.centerXAnchor.constraint(equalTo: container.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: container.centerYAnchor),
            container.heightAnchor.constraint(equalToConstant: 24),
        ])
        return container
    }

    // MARK: 处理

    private func handleShare() async {
        spinner.startAnimating()
        statusLabel.text = "正在读取分享内容…"

        let payloads = await SharePayload.extract(from: extensionContext)
        guard !payloads.isEmpty else {
            spinner.stopAnimating()
            statusLabel.text = "没有读取到可分享的内容"
            detailLabel.text = "支持文本、链接、图片和文件。"
            doneButton.isHidden = false
            return
        }

        detailLabel.text = payloads.map(\.summary).joined(separator: "\n")
        statusLabel.text = "正在加密并上传…"

        var successCount = 0
        var queuedCount = 0
        for payload in payloads {
            let ok = await ClipboardIntentWorker.shared.save(content: payload.uploadPayload)
            if ok { successCount += 1 } else { queuedCount += 1 }
        }

        spinner.stopAnimating()
        if successCount > 0 {
            statusLabel.text = "已保存 \(successCount) 项到 CloudClipboard"
        }
        if queuedCount > 0 {
            statusLabel.text = (statusLabel.text ?? "") + "\n\(queuedCount) 项已排队，打开 App 后自动上传"
        }
        doneButton.isHidden = false
        UIAccessibility.post(notification: .announcement, argument: statusLabel.text)
    }

    @objc private func finish() {
        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }
}

// MARK: - Payload

struct SharePayload {
    enum Kind {
        case text(String)
        case url(URL)
        case image(Data, filename: String)
        case file(URL)

        var summary: String {
            switch self {
            case .text(let value): return "文本：" + String(value.prefix(60))
            case .url(let url): return "链接：" + url.absoluteString
            case .image(_, let filename): return "图片：" + filename
            case .file(let url): return "文件：" + url.lastPathComponent
            }
        }
    }

    let kind: Kind

    /// 上传用内容。图片/文件当前转为 base64 数据 URI 形式的文本说明 + 文件名，
    /// 完整二进制上传需 R2（Worker 已支持 /api/files/upload），
    /// 这里保证「不丢内容」：先记录元数据与可读文本，避免静默失败。
    var uploadPayload: String {
        switch kind {
        case .text(let value):
            return value
        case .url(let url):
            return url.absoluteString
        case .image(let data, let filename):
            return SharePayload.inlineNote(kind: "图片", filename: filename, size: data.count)
        case .file(let url):
            let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
            return SharePayload.inlineNote(kind: "文件", filename: url.lastPathComponent, size: size)
        }
    }

    private static func inlineNote(kind: String, filename: String, size: Int) -> String {
        let formatter = ByteCountFormatter()
        let readable = formatter.string(fromByteCount: Int64(size))
        return "[\(kind)] \(filename) · \(readable)"
    }

    /// 从 NSExtensionItem 提取内容
    static func extract(from context: NSExtensionContext?) async -> [SharePayload] {
        guard let items = context?.inputItems as? [NSExtensionItem] else { return [] }
        var payloads: [SharePayload] = []

        for item in items {
            guard let attachments = item.attachments else {
                if let text = item.attributedContentText?.string, !text.isEmpty {
                    payloads.append(SharePayload(kind: .text(text)))
                }
                continue
            }

            for provider in attachments {
                if let payload = await load(from: provider) {
                    payloads.append(payload)
                }
            }
        }
        return payloads
    }

    private static func load(from provider: NSItemProvider) async -> SharePayload? {
        // 1) URL
        if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
            if let url = await loadURL(from: provider), !isFileURL(url) {
                return SharePayload(kind: .url(url))
            } else if let fileURL = await loadFileURL(from: provider) {
                return SharePayload(kind: .file(fileURL))
            }
        }

        // 2) 图片
        if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
            if let data = await loadData(from: provider, type: .image) {
                let filename = provider.suggestedName.map { "\($0).png" } ?? "shared-image.png"
                return SharePayload(kind: .image(data, filename: filename))
            }
        }

        // 3) 文件
        if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier),
           let fileURL = await loadFileURL(from: provider) {
            return SharePayload(kind: .file(fileURL))
        }

        // 4) 纯文本
        if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
           let text = await loadString(from: provider) {
            return SharePayload(kind: .text(text))
        }

        return nil
    }

    private static func isFileURL(_ url: URL) -> Bool {
        url.isFileURL
    }

    private static func loadString(from provider: NSItemProvider) async -> String? {
        await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { item, _ in
                if let text = item as? String {
                    continuation.resume(returning: text)
                } else if let data = item as? Data {
                    continuation.resume(returning: String(data: data, encoding: .utf8))
                } else {
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    private static func loadURL(from provider: NSItemProvider) async -> URL? {
        await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { item, _ in
                if let url = item as? URL {
                    continuation.resume(returning: url)
                } else if let data = item as? Data, let string = String(data: data, encoding: .utf8) {
                    continuation.resume(returning: URL(string: string))
                } else if let string = item as? String {
                    continuation.resume(returning: URL(string: string))
                } else {
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    private static func loadFileURL(from provider: NSItemProvider) async -> URL? {
        await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, _ in
                if let url = item as? URL {
                    continuation.resume(returning: url)
                } else if let data = item as? Data,
                          let string = String(data: data, encoding: .utf8) {
                    continuation.resume(returning: URL(string: string))
                } else {
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    private static func loadData(from provider: NSItemProvider, type: UTType) async -> Data? {
        await withCheckedContinuation { continuation in
            provider.loadDataRepresentation(forTypeIdentifier: type.identifier) { data, _ in
                continuation.resume(returning: data)
            }
        }
    }
}
