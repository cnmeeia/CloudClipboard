//
//  CommandPaletteView.swift
//  CloudClipboard
//
//  命令面板（对齐 Web 的 ⌘K）：搜索 + 快捷指令。
//  斜杠指令保留 Web 端语义（/settings、/devices、/notifications、/theme）。
//

import SwiftUI
import CloudClipboardShared

struct CommandPaletteView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(AppRouter.self) private var router
    @Environment(\.dismiss) private var dismiss

    @State private var query = ""
    @State private var toast: ToastMessage?
    @FocusState private var isFocused: Bool

    private var results: [ClipboardItemDTO] {
        query.isEmpty ? Array(environment.clipboard.items.prefix(5)) : environment.clipboard.search(query).prefix(20).map { $0 }
    }

    var body: some View {
        NavigationStack {
            List {
                if !query.isEmpty, !isSlashCommand {
                    Section("推送内容") {
                        Button {
                            Task { await push(query) }
                        } label: {
                            Label("上传「\(query.prefix(40))」到云端", systemImage: "icloud.and.arrow.up")
                        }
                    }
                }

                if isSlashCommand {
                    Section("指令") {
                        ForEach(slashCommands.filter { $0.command.hasPrefix(query.lowercased()) || query.count <= 1 }, id: \.command) { item in
                            Button {
                                run(item.command)
                            } label: {
                                Label(item.title, systemImage: item.systemImage)
                            }
                        }
                    }
                }

                if !results.isEmpty {
                    Section("剪贴板记录") {
                        ForEach(results) { item in
                            Button {
                                router.handle(.clipboardDetail(id: item.id))
                                dismiss()
                            } label: {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(environment.clipboard.plaintext(for: item).map { String($0.prefix(60)) } ?? "无法解密")
                                        .font(.subheadline)
                                        .lineLimit(1)
                                    Text("\(item.type.displayName) · \(ClipboardDateFormatting.relative(for: item.createdDate))")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
            .searchable(text: $query, prompt: "搜索内容，或输入 / 使用指令")
            .navigationTitle("命令面板")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("完成") { dismiss() }
                }
            }
            .toast($toast)
            .onAppear { isFocused = true }
        }
    }

    private var isSlashCommand: Bool { query.hasPrefix("/") }

    private var slashCommands: [(command: String, title: String, systemImage: String)] {
        [
            ("/new", "推送当前系统剪贴板", "doc.on.clipboard"),
            ("/settings", "打开设置", "gearshape"),
            ("/devices", "管理设备", "laptopcomputer.and.iphone"),
            ("/theme", "切换主题", "circle.lefthalf.filled"),
            ("/sync", "立即同步", "arrow.triangle.2.circlepath"),
            ("/lock", "清空本地明文缓存", "lock"),
        ]
    }

    private func run(_ command: String) {
        switch command {
        case "/new":
            Task {
                if let text = environment.clipboardMonitor.readCurrentClipboard() {
                    await push(text)
                } else {
                    toast = ToastMessage(text: "系统剪贴板是空的", style: .warning)
                }
            }
        case "/settings":
            router.handle(.settings); dismiss()
        case "/devices":
            router.handle(.devices); dismiss()
        case "/theme":
            let next: ThemeMode = environment.prefs.theme == .dark ? .light : (environment.prefs.theme == .light ? .system : .dark)
            Task { await environment.prefs.setTheme(next) }
            toast = ToastMessage(text: "主题：\(next.displayName)", style: .info)
        case "/sync":
            Task { await environment.syncEngine.syncNow(reason: "命令面板") }
            toast = ToastMessage(text: "已触发同步", style: .info)
        case "/lock":
            environment.clipboard.clearPlaintextCache()
            toast = ToastMessage(text: "本地明文缓存已清空", style: .success)
        default:
            break
        }
    }

    private func push(_ text: String) async {
        switch await environment.clipboard.push(content: text) {
        case .success:
            environment.haptics.synced()
            toast = ToastMessage(text: "已同步到云端", style: .success)
        case .queuedLocally:
            toast = ToastMessage(text: "已保存到本地，联网后上传", style: .warning)
        case .failure(let message):
            environment.haptics.failed()
            toast = ToastMessage(text: message, style: .error)
        }
    }
}
