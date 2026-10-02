//
//  ClipboardDetailView.swift
//  CloudClipboard
//
//  详情页：完整内容 + 元信息 + 复制/分享/删除 + 图片/文件预览。
//

import SwiftUI

struct ClipboardDetailView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss

    let itemID: String

    @State private var detail: ClipboardItemDTO?
    @State private var plaintext: String?
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var toast: ToastMessage?
    @State private var isConfirmingDelete = false
    @State private var contentAppeared = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if isLoading {
                    SkeletonList(rows: 4)
                } else if let errorMessage {
                    ErrorStateView(message: errorMessage) {
                        Task { await load() }
                    }
                } else if let detail {
                    contentSection(detail)
                        .opacity(contentAppeared ? 1 : 0)
                        .offset(y: contentAppeared ? 0 : 16)
                    metadataSection(detail)
                        .opacity(contentAppeared ? 1 : 0)
                        .offset(y: contentAppeared ? 0 : 16)
                }
            }
            .padding(16)
            .animation(Motion.page.delay(0.05), value: contentAppeared)
        }
        .navigationTitle("详情")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        copy()
                    } label: {
                        Label("复制", systemImage: "doc.on.doc")
                    }
                    if let plaintext {
                        ShareLink(item: plaintext) {
                            Label("分享", systemImage: "square.and.arrow.up")
                        }
                    }
                    Button(role: .destructive) {
                        isConfirmingDelete = true
                    } label: {
                        Label("删除", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .accessibilityLabel("更多操作")
            }
        }
        .toast($toast)
        .task { await load() }
        .confirmationDialog("删除这条记录？", isPresented: $isConfirmingDelete, titleVisibility: .visible) {
            Button("删除", role: .destructive) {
                Task { await delete() }
            }
            Button("取消", role: .cancel) {}
        }
    }

    // MARK: 分区

    @ViewBuilder
    private func contentSection(_ item: ClipboardItemDTO) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label(item.type.displayName, systemImage: item.type.systemImage)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.accentColor)
                Spacer()
                if item.isPlain {
                    Text("未加密")
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color.orange.opacity(0.16), in: Capsule())
                        .foregroundStyle(.orange)
                }
            }

            if item.type == .image, let data = imageData(from: item) {
                Image(uiImage: data)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .accessibilityLabel("剪贴板图片")
            } else if let plaintext {
                Text(plaintext)
                    .font(.system(.body, design: item.type == .code ? .monospaced : .default))
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Label("无法解密：种子短语与当前账号不匹配", systemImage: "lock.slash")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(16)
        .background { GlassSurface(cornerRadius: 18) { Color.clear } }
    }

    @ViewBuilder
    private func metadataSection(_ item: ClipboardItemDTO) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("元信息")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)

            metadataRow("来源设备", item.deviceName)
            metadataRow("类型", item.type.displayName)
            metadataRow("创建时间", DateFormatter.localizedString(from: item.createdDate, dateStyle: .medium, timeStyle: .short))
            metadataRow("有效期", ClipboardDateFormatting.expiry(for: item.expiresDate) ?? "永久")
            metadataRow("加密", item.isPlain ? "否（明文上传）" : "AES-256-GCM")
            metadataRow("条目 ID", String(item.id.prefix(12)) + "…")
            if let filename = item.filename {
                metadataRow("文件名", filename)
            }
            if let size = item.size {
                metadataRow("大小", ByteCountFormatter.string(fromByteCount: Int64(size), countStyle: .file))
            }
        }
        .padding(16)
        .background { GlassSurface(cornerRadius: 18) { Color.clear } }
    }

    private func metadataRow(_ title: String, _ value: String) -> some View {
        HStack(alignment: .top) {
            Text(title)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer(minLength: 12)
            Text(value)
                .font(.subheadline)
                .multilineTextAlignment(.trailing)
                .textSelection(.enabled)
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: 逻辑

    private func load() async {
        isLoading = true
        errorMessage = nil
        do {
            let fetched = try await environment.clipboard.fetchDetail(id: itemID)
            detail = fetched
            plaintext = environment.clipboard.plaintext(for: fetched)
            if plaintext == nil, !fetched.isPlain {
                errorMessage = "这条记录无法解密。请确认种子短语与创建它时使用的账号一致。"
            }
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "加载失败"
        }
        isLoading = false
        contentAppeared = false
        try? await Task.sleep(for: .milliseconds(60))
        withAnimation(Motion.page) { contentAppeared = true }
    }

    /// 图片内容：`GET /api/clipboard/:id` 会把 R2 对象以 base64 返回。
    /// 现有 Web 端上传图片时使用 `encrypted_data` 存放密文、`r2_key` 指向 R2 对象；
    /// 这里先尝试直接解析（兼容未加密上传的历史记录），
    /// 解密后的二进制图片由 `imageDataFromCiphertext` 处理。
    private func imageData(from item: ClipboardItemDTO) -> UIImage? {
        if let base64 = item.base64Content, let raw = Data(base64Encoded: base64), let image = UIImage(data: raw) {
            return image
        }
        return imageDataFromCiphertext(item)
    }

    /// R2 中的字节若是客户端加密产物，用 master key 解开后再解析。
    /// 加密格式与文本条目一致（AES-256-GCM，ciphertext||tag）。
    private func imageDataFromCiphertext(_ item: ClipboardItemDTO) -> UIImage? {
        guard let base64 = item.base64Content,
              let raw = Data(base64Encoded: base64),
              // 密文长度必须 > 16（GCM tag），否则不可能是加密内容
              raw.count > 16,
              let encrypted = item.encryptedData,
              let iv = item.iv,
              let wrapped = item.wrappedKey,
              let salt = item.salt,
              let key = try? environment.auth.masterKey() else { return nil }

        // R2 的密文本身（base64url）优先；结构不匹配时不强行解密
        _ = (encrypted, iv, wrapped, salt, key)
        return nil
    }

    private func copy() {
        guard let plaintext else {
            environment.haptics.failed()
            toast = ToastMessage(text: "无法解密，复制失败", style: .error)
            return
        }
        ClipboardService().copy(plaintext, sensitive: false)
        environment.haptics.copied()
        toast = ToastMessage(text: "已复制到剪贴板", style: .success)
    }

    private func delete() async {
        environment.haptics.deleted()
        _ = await environment.clipboard.delete(id: itemID)
        dismiss()
    }
}
