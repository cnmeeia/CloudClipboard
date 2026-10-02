//
//  ContentRenderer.swift
//  CloudClipboard
//
//  按类型渲染内容：文本 / URL / 代码 / JSON / 颜色 / OTP 验证码。
//  纯 SwiftUI 实现，无 HTML。
//

import SwiftUI

struct ContentRenderer: View {
    let text: String
    let type: ClipboardType
    var lineLimit: Int? = 4

    private var trimmed: String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var detectedKind: Kind {
        Kind.detect(trimmed, declared: type)
    }

    var body: some View {
        switch detectedKind {
        case .url:
            urlBody
        case .code:
            codeBody
        case .color(let color):
            colorBody(color)
        case .otp:
            otpBody
        case .json:
            plainBody(monospaced: true)
        case .text:
            plainBody(monospaced: false)
        }
    }

    // MARK: 分支

    private var urlBody: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(trimmed)
                .font(Typography.subheadlineMedium)
                .foregroundStyle(Color.accentColor)
                .lineLimit(lineLimit)

            if let host = URL(string: trimmed)?.host {
                Text(host)
                    .font(Typography.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var codeBody: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            Text(trimmed)
                .font(.system(.subheadline, design: .monospaced))
                .lineLimit(lineLimit)
                .multilineTextAlignment(.leading)
        }
    }

    private func colorBody(_ color: Color) -> some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(color)
                .frame(width: 26, height: 26)
                .overlay(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .strokeBorder(Color.primary.opacity(0.12), lineWidth: 0.5)
                )
            Text(trimmed.uppercased())
                .font(.system(.subheadline, design: .monospaced))
        }
    }

    private var otpBody: some View {
        HStack(spacing: 10) {
            Text(trimmed)
                .font(.system(.title3, design: .monospaced).weight(.semibold))
                .kerning(2)
                .accessibilityLabel("验证码 \(trimmed.map(String.init).joined(separator: " "))")
            Image(systemName: "lock.shield")
                .font(Typography.caption)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
        }
    }

    private func plainBody(monospaced: Bool) -> some View {
        Text(trimmed)
            .font(monospaced ? .system(.subheadline, design: .monospaced) : .subheadline)
            .lineLimit(lineLimit)
            .multilineTextAlignment(.leading)
    }

    // MARK: 类型识别

    enum Kind: Equatable {
        case text, url, code, json, color(Color), otp

        static func detect(_ value: String, declared: ClipboardType) -> Kind {
            if let color = Kind.parseColor(value) { return .color(color) }

            if value.count <= 8, value.allSatisfy(\.isNumber) { return .otp }

            if (value.hasPrefix("{") && value.hasSuffix("}")) || (value.hasPrefix("[") && value.hasSuffix("]")) {
                if (try? JSONSerialization.jsonObject(with: Data(value.utf8))) != nil {
                    return .json
                }
            }

            if declared == .url { return .url }
            if declared == .code { return .code }

            if (value.hasPrefix("http://") || value.hasPrefix("https://")), !value.contains(" "), URL(string: value) != nil {
                return .url
            }

            return .text
        }

        /// #RGB / #RRGGBB / rgb(...)
        static func parseColor(_ value: String) -> Color? {
            let lower = value.lowercased()
            if lower.hasPrefix("#") {
                let hex = String(lower.dropFirst())
                guard hex.count == 3 || hex.count == 6, hex.allSatisfy({ $0.isHexDigit }) else { return nil }
                let expanded = hex.count == 3 ? hex.map { "\($0)\($0)" }.joined() : hex
                guard let int = UInt64(expanded, radix: 16) else { return nil }
                return Color(
                    red: Double((int >> 16) & 0xFF) / 255,
                    green: Double((int >> 8) & 0xFF) / 255,
                    blue: Double(int & 0xFF) / 255
                )
            }
            if lower.hasPrefix("rgb("), lower.hasSuffix(")") {
                let inner = lower.dropFirst(4).dropLast()
                let parts = inner.split(separator: ",").compactMap { Double($0.trimmingCharacters(in: .whitespaces)) }
                guard parts.count == 3 else { return nil }
                return Color(red: parts[0] / 255, green: parts[1] / 255, blue: parts[2] / 255)
            }
            return nil
        }
    }
}
