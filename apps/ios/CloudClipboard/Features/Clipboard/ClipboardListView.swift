//
//  ClipboardListView.swift
//  CloudClipboard
//
//  原生首页：NavigationStack + List + pull to refresh + swipe actions +
//  context menu + searchable + 骨架屏 + 空态/错误/离线态。
//

import SwiftUI

struct ClipboardListView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(AppRouter.self) private var router

    @State private var toast: ToastMessage?
    @State private var pendingDelete: ClipboardItemDTO?
    @State private var isPushingClipboard = false
    @State private var appeared = false
    @Environment(\.accessibilityReduceMotion) private var reducedMotion

    private var repository: ClipboardRepository { environment.clipboard }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            content
            FloatingActionButton(
                systemImage: "plus",
                accessibilityTitle: "上传当前剪贴板"
            ) {
                Task { await pushCurrentClipboard() }
            }
            .padding(.trailing, 20)
            .padding(.bottom, 24)
        }
        .navigationTitle("CloudClipboard")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                syncStatusView
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    environment.haptics.play(.selection)
                    router.isPresentingCommandPalette = true
                } label: {
                    Image(systemName: "command")
                }
                .accessibilityLabel("打开命令面板")
                .accessibilityHint("快速搜索或推送剪贴板内容")
            }
        }
        .sheet(isPresented: Binding(
            get: { router.isPresentingCommandPalette },
            set: { router.isPresentingCommandPalette = $0 }
        )) {
            CommandPaletteView()
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .toast($toast)
        .task {
            await repository.refresh()
            repository.warmPlaintextCache()
        }
        .refreshable {
            await environment.syncEngine.syncNow(reason: "下拉刷新")
            repository.warmPlaintextCache()
        }
        .confirmationDialog(
            "删除这条剪贴板记录？",
            isPresented: Binding(
                get: { pendingDelete != nil },
                set: { if !$0 { pendingDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("删除", role: .destructive) {
                if let item = pendingDelete {
                    Task { await delete(item) }
                }
                pendingDelete = nil
            }
            Button("取消", role: .cancel) { pendingDelete = nil }
        } message: {
            Text("删除后无法恢复，云端记录也会一并清除。")
        }
    }

    // MARK: 内容

    @ViewBuilder
    private var content: some View {
        VStack(spacing: 0) {
            if repository.isOffline {
                OfflineBanner()
            }

            if repository.isLoading && repository.items.isEmpty {
                ScrollView { SkeletonList() }
            } else if let error = repository.loadError, repository.items.isEmpty {
                ErrorStateView(message: error) {
                    Task { await repository.refresh() }
                }
            } else if repository.items.isEmpty {
                EmptyStateView(
                    systemImage: "doc.on.clipboard",
                    title: "还没有剪贴板记录",
                    message: "复制任意内容后点右下角 ＋ 上传，或从其他设备复制自动同步过来。",
                    actionTitle: "上传当前剪贴板"
                ) {
                    Task { await pushCurrentClipboard() }
                }
            } else {
                list
            }
        }
    }

    private var list: some View {
        List {
            ForEach(sections, id: \.title) { section in
                Section {
                    ForEach(Array(section.items.enumerated()), id: \.element.id) { index, item in
                        ClipboardRowView(item: item)
                            .contentShape(Rectangle())
                            .onTapGesture { copy(item) }
                            .contextMenu {
                                contextMenu(for: item)
                            }
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    pendingDelete = item
                                } label: {
                                    Label("删除", systemImage: "trash")
                                }

                                Button {
                                    copy(item)
                                } label: {
                                    Label("复制", systemImage: "doc.on.doc")
                                }
                                .tint(.accentColor)
                            }
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                            .opacity(appeared ? 1 : 0)
                            .offset(y: appeared ? 0 : 14)
                            .animation(
                                reducedMotion ? nil : Motion.spring.delay(Double(min(index, Motion.staggerMaxItems)) * Motion.staggerStep),
                                value: appeared
                            )
                    }
                } header: {
                    Text(section.title)
                        .font(Typography.footnoteSemibold)
                        .foregroundStyle(.secondary)
                        .textCase(nil)
                        .padding(.leading, 4)
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .listSectionSpacing(18)
        .contentMargins(.top, 8, for: .scrollContent)
        .contentMargins(.bottom, 96, for: .scrollContent)
        .onAppear { appeared = true }
    }


    private var sections: [(title: String, items: [ClipboardItemDTO])] {
        let grouped = Dictionary(grouping: repository.items) { item in
            ClipboardDateFormatting.sectionTitle(for: item.createdDate)
        }
        // 固定顺序，避免分组标题跳动
        let order = ["今天", "昨天", "本周", "本月", "更早"]
        return order.compactMap { title in
            guard let items = grouped[title], !items.isEmpty else { return nil }
            return (title, items)
        }
    }

    // MARK: 顶栏同步状态

    private var syncStatusView: some View {
        HStack(spacing: 6) {
            if environment.syncEngine.isSyncing {
                ProgressView().controlSize(.mini)
            } else {
                Image(systemName: repository.isOffline ? "wifi.slash" : "checkmark.icloud")
                    .font(Typography.caption)
                    .foregroundStyle(repository.isOffline ? .orange : .secondary)
            }
            Text(syncDescription)
                .font(Typography.caption2)
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(syncDescription)
    }

    private var syncDescription: String {
        if repository.isOffline { return "离线" }
        if environment.syncEngine.isSyncing { return "同步中" }
        guard let last = environment.syncEngine.lastSyncAt else { return "待同步" }
        return ClipboardDateFormatting.relative(for: last)
    }

    // MARK: 操作

    @ViewBuilder
    private func contextMenu(for item: ClipboardItemDTO) -> some View {
        Button {
            copy(item)
        } label: {
            Label("复制", systemImage: "doc.on.doc")
        }

        Button {
            Task { await environment.syncEngine.reindexSpotlight() }
        } label: {
            Label("刷新索引", systemImage: "arrow.triangle.2.circlepath")
        }

        ShareLink(item: repository.plaintext(for: item) ?? "") {
            Label("分享", systemImage: "square.and.arrow.up")
        }

        Divider()

        Button(role: .destructive) {
            pendingDelete = item
        } label: {
            Label("删除", systemImage: "trash")
        }
    }

    private func copy(_ item: ClipboardItemDTO) {
        guard let text = repository.plaintext(for: item) else {
            toast = ToastMessage(text: "无法解密这条记录", style: .error, detail: "请确认种子短语与当前账号一致")
            environment.haptics.failed()
            return
        }
        ClipboardService().copy(text, sensitive: false)
        environment.clipboardMonitor.markSynced(text)
        environment.haptics.copied()
        toast = ToastMessage(text: "已复制到剪贴板", style: .success)
    }

    private func delete(_ item: ClipboardItemDTO) async {
        environment.haptics.deleted()
        let ok = await repository.delete(id: item.id)
        if ok {
            toast = ToastMessage(text: "已删除", style: .success)
        } else {
            toast = ToastMessage(text: "已离线删除", style: .warning, detail: "联网后会自动从云端清除")
        }
    }

    private func pushCurrentClipboard() async {
        guard !isPushingClipboard else { return }
        isPushingClipboard = true
        defer { isPushingClipboard = false }

        guard let text = environment.clipboardMonitor.readCurrentClipboard() else {
            environment.haptics.play(.warning)
            toast = ToastMessage(text: "系统剪贴板是空的", style: .warning)
            return
        }

        switch await repository.push(content: text) {
        case .success(let id, let deduplicated):
            environment.haptics.synced()
            environment.clipboardMonitor.markSynced(text)
            toast = ToastMessage(
                text: deduplicated ? "内容已在云端，已去重" : "已同步到云端",
                style: .success,
                detail: "ID \(id.prefix(8))"
            )
        case .queuedLocally:
            environment.haptics.play(.warning)
            toast = ToastMessage(text: "已保存到本地", style: .warning, detail: "联网后自动上传")
        case .failure(let message):
            environment.haptics.failed()
            toast = ToastMessage(text: message, style: .error)
        }
    }
}
