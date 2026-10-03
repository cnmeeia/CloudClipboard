//
//  SearchView.swift
//  CloudClipboard
//
//  搜索页：.searchable + 本地匹配（已解密内存缓存 + 元数据）。
//

import SwiftUI
import CloudClipboardShared

struct SearchView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(AppRouter.self) private var router

    @State private var query = ""
    @State private var debounced = ""
    @State private var toast: ToastMessage?

    private var results: [ClipboardItemDTO] {
        guard !debounced.isEmpty else { return [] }
        return environment.clipboard.search(debounced)
    }

    var body: some View {
        Group {
            if debounced.isEmpty {
                EmptyStateView(
                    systemImage: "magnifyingglass",
                    title: "搜索剪贴板",
                    message: "输入关键词，按内容、设备名或文件名查找。"
                )
            } else if results.isEmpty {
                EmptyStateView(
                    systemImage: "questionmark.folder",
                    title: "没有匹配结果",
                    message: "试试其他关键词，或先同步一次最新记录。"
                )
            } else {
                List {
                    ForEach(results) { item in
                        ClipboardRowView(item: item)
                            .onTapGesture {
                                if let text = environment.clipboard.plaintext(for: item) {
                                    ClipboardService().copy(text, sensitive: false)
                                    environment.haptics.copied()
                                    toast = ToastMessage(text: "已复制", style: .success)
                                }
                            }
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
        .navigationTitle("搜索")
        .searchable(text: $query, prompt: "搜索剪贴板内容")
        .toast($toast)
        .task {
            if environment.clipboard.items.isEmpty {
                await environment.clipboard.refresh(showSpinner: false)
            }
            environment.clipboard.warmPlaintextCache()
        }
        .task(id: query) {
            // 250ms 防抖，避免每次输入都全量过滤
            try? await Task.sleep(nanoseconds: 250_000_000)
            guard !Task.isCancelled else { return }
            debounced = query
        }
        .onChange(of: router.searchQuery) { _, newValue in
            if !newValue.isEmpty { query = newValue }
        }
    }
}
