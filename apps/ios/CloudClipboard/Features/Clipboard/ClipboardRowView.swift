//
//  ClipboardRowView.swift
//  CloudClipboard
//
//  列表行：类型图标 + 内容预览 + 设备/时间 + 元信息。
//  无障碍：整行合并为一个元素，VoiceOver 读出类型、内容、来源、时间。
//

import SwiftUI
import CloudClipboardShared

struct ClipboardRowView: View {
    @Environment(AppEnvironment.self) private var environment
    let item: ClipboardItemDTO

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: item.type.systemImage)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Color.accentColor)
                .frame(width: 36, height: 36)
                .background(
                    Color.accentColor.opacity(0.14),
                    in: RoundedRectangle(cornerRadius: 11, style: .continuous)
                )
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 6) {
                preview

                HStack(spacing: 8) {
                    Label(item.deviceName, systemImage: "iphone")
                        .labelStyle(.titleAndIcon)
                        .lineLimit(1)

                    Text("·")
                    Text(ClipboardDateFormatting.relative(for: item.createdDate))

                    if item.isPlain {
                        Text("未加密")
                            .foregroundStyle(.orange)
                    }
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)

            if item.type == .image || item.type == .file {
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
                    .accessibilityHidden(true)
            }
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 14)
        .background {
            GlassSurface(cornerRadius: 18) { Color.clear }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
        .accessibilityHint("双击复制内容")
        .accessibilityAddTraits(.isButton)
    }

    @ViewBuilder
    private var preview: some View {
        if let text = environment.clipboard.plaintext(for: item) {
            ContentRenderer(text: text, type: item.type, lineLimit: 4)
        } else {
            HStack(spacing: 6) {
                Image(systemName: "lock.trianglebadge.exclamationmark")
                    .font(.caption)
                Text("无法解密（种子短语不匹配）")
                    .font(.subheadline)
            }
            .foregroundStyle(.secondary)
        }
    }

    private var accessibilityText: String {
        var parts: [String] = []
        parts.append("\(item.type.displayName)")
        if let text = environment.clipboard.plaintext(for: item) {
            parts.append(String(text.prefix(80)))
        } else {
            parts.append("无法解密")
        }
        parts.append("来自 \(item.deviceName)")
        parts.append(ClipboardDateFormatting.relative(for: item.createdDate))
        if item.isPlain { parts.append("未加密") }
        return parts.joined(separator: "，")
    }
}
