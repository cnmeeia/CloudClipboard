//
//  StateViews.swift
//  CloudClipboard
//
//  空态 / 骨架 / 错误 / 离线态。
//  所有状态都提供文字说明，不只靠颜色（无障碍要求）。
//

import SwiftUI

// MARK: - 骨架屏

struct SkeletonRow: View {
    @State private var phase: CGFloat = -1

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Color.primary.opacity(0.08))
                .frame(width: 32, height: 32)

            VStack(alignment: .leading, spacing: 8) {
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .fill(Color.primary.opacity(0.08))
                    .frame(height: 14)
                    .frame(maxWidth: .infinity)
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .fill(Color.primary.opacity(0.06))
                    .frame(height: 12)
                    .frame(width: 140, alignment: .leading)
            }
        }
        .padding(.vertical, 6)
        .overlay {
            LinearGradient(
                colors: [.clear, Color.primary.opacity(0.05), .clear],
                startPoint: .leading,
                endPoint: .trailing
            )
            .offset(x: phase * 220)
        }
        .clipped()
        .onAppear {
            withAnimation(.linear(duration: 1.3).repeatForever(autoreverses: false)) {
                phase = 1.4
            }
        }
        .accessibilityHidden(true)
    }
}

struct SkeletonList: View {
    var rows: Int = 8

    var body: some View {
        VStack(spacing: 10) {
            ForEach(0..<rows, id: \.self) { _ in
                SkeletonRow()
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .accessibilityLabel("正在加载剪贴板列表")
    }
}

// MARK: - 空态

struct EmptyStateView: View {
    var systemImage: String
    var title: String
    var message: String
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil

    @State private var appeared = false

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: systemImage)
                .font(.system(size: 34, weight: .medium))
                .foregroundStyle(Color.accentColor)
                .frame(width: 84, height: 84)
                .background {
                    GlassSurface(cornerRadius: 24) { Color.clear }
                }
                .accessibilityHidden(true)
                .scaleEffect(appeared ? 1 : 0.8)

            Text(title)
                .font(.system(.headline, design: .rounded))
                .multilineTextAlignment(.center)

            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .clipShape(Capsule())
            }
        }
        .padding(32)
        .frame(maxWidth: 420)
        .opacity(appeared ? 1 : 0)
        .offset(y: appeared ? 0 : 12)
        .onAppear {
            withAnimation(Motion.hero.delay(0.1)) { appeared = true }
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - 错误态

struct ErrorStateView: View {
    let message: String
    var retry: (() -> Void)?

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 32, weight: .medium))
                .foregroundStyle(.orange)
                .frame(width: 80, height: 80)
                .background {
                    GlassSurface(cornerRadius: 24) { Color.clear }
                }
                .accessibilityHidden(true)

            Text(message)
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            if let retry {
                Button(action: retry) {
                    Label("重试", systemImage: "arrow.clockwise")
                }
                .adaptiveGlassButton()
                .controlSize(.large)
            }
        }
        .padding(32)
        .frame(maxWidth: 420)
    }
}

// MARK: - 离线横幅

struct OfflineBanner: View {
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "wifi.slash")
                .accessibilityHidden(true)
            Text("网络不可用，显示本地缓存")
                .font(.footnote.weight(.medium))
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(Color.orange.opacity(0.16))
        .foregroundStyle(Color.orange)
        .accessibilityLabel("离线状态：网络不可用，正在显示本地缓存")
    }
}

// MARK: - 锁屏覆盖层

struct LockedOverlayView: View {
    var retry: () -> Void

    var body: some View {
        ZStack {
            Rectangle()
                .fill(.ultraThinMaterial)
                .ignoresSafeArea()

            VStack(spacing: 16) {
                Image(systemName: "lock.shield.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(Color.accentColor)
                    .accessibilityHidden(true)
                Text("CloudClipboard 已锁定")
                    .font(.title3.weight(.semibold))
                Text("验证身份后查看剪贴板内容")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Button("解锁", action: retry)
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
            }
            .padding(32)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("应用已锁定，请验证身份")
    }
}
