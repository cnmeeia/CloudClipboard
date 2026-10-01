//
//  DevicesView.swift
//  CloudClipboard
//
//  设备列表：重命名、设置 Bark 地址、删除。
//

import SwiftUI

struct DevicesView: View {
    @Environment(AppEnvironment.self) private var environment

    @State private var toast: ToastMessage?
    @State private var renaming: DeviceDTO?
    @State private var newName = ""
    @State private var barkEditing: DeviceDTO?
    @State private var barkURL = ""
    @State private var pendingDelete: DeviceDTO?

    var body: some View {
        List {
            ForEach(environment.devices.devices) { device in
                row(device)
                    .listRowBackground(Color.clear)
                    .swipeActions(edge: .trailing) {
                        if device.id != environment.devices.deviceId {
                            Button(role: .destructive) {
                                pendingDelete = device
                            } label: {
                                Label("删除", systemImage: "trash")
                            }
                        }
                        Button {
                            renaming = device
                            newName = device.name
                        } label: {
                            Label("重命名", systemImage: "pencil")
                        }
                        .tint(.accentColor)
                    }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .navigationTitle("设备")
        .overlay {
            if environment.devices.devices.isEmpty && !environment.devices.isLoading {
                EmptyStateView(
                    systemImage: "laptopcomputer.and.iphone",
                    title: "还没有其他设备",
                    message: "在 Web 端或其他 iOS 设备登录后会自动出现在这里。"
                )
            }
        }
        .refreshable { await environment.devices.loadDevices() }
        .task { await environment.devices.loadDevices() }
        .toast($toast)
        .alert("重命名设备", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
            TextField("设备名称", text: $newName)
            Button("保存") {
                if let device = renaming {
                    Task {
                        await environment.devices.rename(device.id, to: newName)
                        toast = ToastMessage(text: "已重命名", style: .success)
                    }
                }
                renaming = nil
            }
            Button("取消", role: .cancel) { renaming = nil }
        }
        .alert("Bark 推送地址", isPresented: Binding(get: { barkEditing != nil }, set: { if !$0 { barkEditing = nil } })) {
            TextField("https://api.day.app/DEVICEKEY", text: $barkURL)
            Button("保存") {
                if let device = barkEditing {
                    Task {
                        await environment.devices.setBarkURL(device.id, barkURL: barkURL)
                        toast = ToastMessage(text: "已保存 Bark 地址", style: .success)
                    }
                }
                barkEditing = nil
            }
            Button("取消", role: .cancel) { barkEditing = nil }
        } message: {
            Text("用于服务端在别的设备复制内容时推送到这台设备。")
        }
        .confirmationDialog("删除设备？", isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }), titleVisibility: .visible) {
            Button("删除", role: .destructive) {
                if let device = pendingDelete {
                    Task {
                        await environment.devices.delete(device.id)
                        toast = ToastMessage(text: "已删除设备", style: .success)
                    }
                }
                pendingDelete = nil
            }
            Button("取消", role: .cancel) { pendingDelete = nil }
        } message: {
            Text("删除后该设备的剪贴板记录会一并清除。")
        }
    }

    private func row(_ device: DeviceDTO) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: device.deviceType == "other" ? "iphone" : "laptopcomputer")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(device.isOnline ? Color.accentColor : .secondary)
                .frame(width: 32, height: 32)
                .background(Color.accentColor.opacity(device.isOnline ? 0.14 : 0.06), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(device.name)
                        .font(.subheadline.weight(.semibold))
                    if device.id == environment.devices.deviceId {
                        Text("本机")
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.accentColor.opacity(0.16), in: Capsule())
                    }
                }

                Text("\(device.platform) · \(device.isOnline ? "在线" : "离线") · \(ClipboardDateFormatting.relative(for: device.lastSeenDate))")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                if let bark = device.barkUrl, !bark.isEmpty {
                    Label("已配置 Bark 通知", systemImage: "bell.badge")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
        .contextMenu {
            Button {
                renaming = device
                newName = device.name
            } label: {
                Label("重命名", systemImage: "pencil")
            }
            Button {
                barkEditing = device
                barkURL = device.barkUrl ?? ""
            } label: {
                Label("设置 Bark 地址", systemImage: "bell")
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(device.name)，\(device.platform)，\(device.isOnline ? "在线" : "离线")")
    }
}
