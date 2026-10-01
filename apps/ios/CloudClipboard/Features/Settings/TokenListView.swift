//
//  TokenListView.swift
//  CloudClipboard
//
//  API 令牌管理。明文 token 只在创建时显示一次。
//

import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

struct TokenListView: View {
    @Environment(AppEnvironment.self) private var environment

    @State private var toast: ToastMessage?
    @State private var showingCreate = false
    @State private var newTokenName = ""
    @State private var createdToken: String?
    @State private var pendingRevoke: ApiTokenDTO?

    var body: some View {
        List {
            if let createdToken {
                Section("刚创建的令牌（仅显示一次）") {
                    Text(createdToken)
                        .font(.system(.footnote, design: .monospaced))
                        .textSelection(.enabled)
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.accentColor.opacity(0.10), in: RoundedRectangle(cornerRadius: 8, style: .continuous))

                    HStack {
                        Button {
                            UIPasteboard.general.string = createdToken
                            environment.haptics.copied()
                            toast = ToastMessage(text: "已复制令牌", style: .success)
                        } label: {
                            Label("复制", systemImage: "doc.on.doc")
                        }
                        Spacer()
                        Button("知道了") {
                            self.createdToken = nil
                            environment.tokens.clearNewlyCreated()
                        }
                        .font(.footnote)
                    }
                }
            }

            Section("已有令牌") {
                ForEach(environment.tokens.tokens) { token in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(token.name)
                            .font(.subheadline.weight(.medium))
                        Text(ClipboardDateFormatting.relative(for: Date(timeIntervalSince1970: Double(token.createdAt) / 1000)))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .swipeActions {
                        Button(role: .destructive) {
                            pendingRevoke = token
                        } label: {
                            Label("吊销", systemImage: "trash")
                        }
                    }
                }

                if environment.tokens.tokens.isEmpty && !environment.tokens.isLoading {
                    Text("还没有令牌")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .navigationTitle("API 令牌")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showingCreate = true
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("创建新令牌")
            }
        }
        .task { await environment.tokens.load() }
        .toast($toast)
        .alert("创建令牌", isPresented: $showingCreate) {
            TextField("令牌名称", text: $newTokenName)
            Button("创建") {
                let name = newTokenName.trimmingCharacters(in: .whitespaces).isEmpty ? "iOS" : newTokenName
                Task {
                    createdToken = await environment.tokens.create(name: name)
                    newTokenName = ""
                }
            }
            Button("取消", role: .cancel) { newTokenName = "" }
        } message: {
            Text("令牌会用于这台 iOS 设备访问你的 CloudClipboard 云端。")
        }
        .confirmationDialog("吊销令牌？", isPresented: Binding(get: { pendingRevoke != nil }, set: { if !$0 { pendingRevoke = nil } }), titleVisibility: .visible) {
            Button("吊销", role: .destructive) {
                if let token = pendingRevoke {
                    Task { await environment.tokens.revoke(token.id) }
                }
                pendingRevoke = nil
            }
            Button("取消", role: .cancel) { pendingRevoke = nil }
        } message: {
            Text("使用该令牌的客户端会立即失去访问权限。")
        }
    }
}
