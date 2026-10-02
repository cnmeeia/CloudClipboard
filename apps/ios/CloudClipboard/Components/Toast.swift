//
//  Toast.swift
//  CloudClipboard
//
//  轻量提示。无障碍：通过 accessibilityAnnouncement 主动播报。
//

import SwiftUI

struct ToastMessage: Equatable, Identifiable {
    enum Style: Equatable {
        case success
        case info
        case warning
        case error

        var systemImage: String {
            switch self {
            case .success: return "checkmark.circle.fill"
            case .info: return "info.circle.fill"
            case .warning: return "exclamationmark.triangle.fill"
            case .error: return "xmark.octagon.fill"
            }
        }

        var tint: Color {
            switch self {
            case .success: return .green
            case .info: return .accentColor
            case .warning: return .orange
            case .error: return .red
            }
        }
    }

    let id = UUID()
    var text: String
    var style: Style = .success
    var detail: String? = nil
}

struct ToastView: View {
    let message: ToastMessage
    @State private var iconBounced = false

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: message.style.systemImage)
                .foregroundStyle(message.style.tint)
                .font(Typography.font(size: 19, weight: .semibold, relativeTo: .headline))
                .scaleEffect(iconBounced ? 1 : 0.5)
                .rotationEffect(.degrees(iconBounced ? 0 : -20))
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(message.text)
                    .font(Typography.subheadlineSemibold)
                if let detail = message.detail {
                    Text(detail)
                        .font(Typography.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
        .frame(maxWidth: 360, alignment: .leading)
        .background {
            GlassSurface(cornerRadius: 20) { Color.clear }
        }
        .shadow(color: .black.opacity(0.14), radius: 16, y: 6)
        .onAppear {
            withAnimation(Motion.hero) { iconBounced = true }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(message.text)。\(message.detail ?? "")")
    }
}

/// 挂载在页面顶部
struct ToastModifier: ViewModifier {
    @Binding var message: ToastMessage?

    func body(content: Content) -> some View {
        content.overlay(alignment: .top) {
            if let message {
                ToastView(message: message)
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .task(id: message.id) {
                        try? await Task.sleep(nanoseconds: 2_200_000_000)
                        withAnimation(Motion.spring) { self.message = nil }
                    }
                    .zIndex(1)
            }
        }
        .animation(Motion.spring, value: message)
    }
}

extension View {
    func toast(_ message: Binding<ToastMessage?>) -> some View {
        modifier(ToastModifier(message: message))
    }
}
