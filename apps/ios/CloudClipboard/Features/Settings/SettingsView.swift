//
//  SettingsView.swift
//  CloudClipboard
//
//  设置页（原生 Form + Section），覆盖：外观 / 同步 / 隐私 / 通知 /
//  设备 / API 令牌 / 关于。
//

import SwiftUI

struct SettingsView: View {
    @Environment(AppEnvironment.self) private var environment

    @State private var notificationPrefs = NotificationPrefs()
    @State private var toast: ToastMessage?
    @State private var showingSignOutConfirm = false
    @State private var deviceName: String = ""
    @State private var isRenaming = false
    @State private var isReauthing = false

    var body: some View {
        Form {
            accountSection
            appearanceSection
            syncSection
            securitySection
            notificationSection
            deviceSection
            tokenSection
            aboutSection
        }
        .navigationTitle("设置")
        .toast($toast)
        .task {
            deviceName = environment.devices.deviceName
            notificationPrefs = environment.prefs.notification
        }
        .confirmationDialog("退出登录？", isPresented: $showingSignOutConfirm, titleVisibility: .visible) {
            Button("退出", role: .destructive) {
                Task {
                    await environment.signOut()
                    toast = ToastMessage(text: "已退出登录", style: .info)
                }
            }
            Button("取消", role: .cancel) {}
        } message: {
            Text("本地令牌与种子短语会被清除，云端数据不受影响。")
        }
    }

    // MARK: 账号

    private var accountSection: some View {
        Section("账号") {
            HStack {
                Label("登录方式", systemImage: "person.badge.key")
                Spacer()
                Text(environment.auth.method.displayName)
                    .foregroundStyle(.secondary)
            }

            Button {
                Task { await reauthWithAccess() }
            } label: {
                Label(
                    isReauthing ? "正在打开浏览器…" : "重新进行 Access 登录",
                    systemImage: "lock.shield"
                )
            }
            .disabled(isReauthing)

            Text("Access 会话会过期（时长由 Cloudflare Zero Trust 决定），过期后点这里重新登录；API 令牌不受影响。")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    @MainActor
    private func reauthWithAccess() async {
        isReauthing = true
        defer { isReauthing = false }
        let trimmed = environment.settings.workerURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let baseURL = URL(string: trimmed), baseURL.host != nil else {
            toast = ToastMessage(text: "服务器地址不正确", style: .error)
            return
        }
        do {
            let jwt = try await AccessLoginService().signIn(baseURL: baseURL)
            environment.auth.attachAccessJwt(jwt)
            await environment.refreshAPIConfiguration()
            await environment.auth.refreshIdentity()
            toast = ToastMessage(text: "Access 登录成功", style: .success)
        } catch let error as AccessLoginError {
            if case .cancelled = error { return } // 用户取消，静默
            toast = ToastMessage(text: error.localizedDescription, style: .error)
        } catch {
            toast = ToastMessage(text: "登录失败，请重试", style: .error)
        }
    }

    // MARK: 外观

    private var appearanceSection: some View {
        Section("外观") {
            Picker("主题", selection: Binding(
                get: { environment.prefs.theme },
                set: { value in Task { await environment.prefs.setTheme(value) } }
            )) {
                ForEach(ThemeMode.allCases) { mode in
                    Text(mode.displayName).tag(mode)
                }
            }
            .accessibilityLabel("主题模式")

            Text("主题会同步到你的其他设备（Web 端同样生效）。")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: 同步

    private var syncSection: some View {
        Section("同步") {
            HStack {
                Text("上次同步")
                Spacer()
                Text(environment.syncEngine.lastSyncAt.map { ClipboardDateFormatting.relative(for: $0) } ?? "尚未同步")
                    .foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)

            Toggle("自动检测系统剪贴板", isOn: Binding(
                get: { environment.clipboardMonitor.isEnabled },
                set: { environment.clipboardMonitor.isEnabled = $0 }
            ))
            .accessibilityHint("开启后，App 回到前台时检测新的剪贴板内容")

            Button {
                Task {
                    await environment.syncEngine.syncNow(reason: "手动")
                    toast = ToastMessage(text: "同步完成", style: .success)
                }
            } label: {
                Label("立即同步", systemImage: "arrow.triangle.2.circlepath")
            }

            Text("仅在前台且系统允许时读取剪贴板，不做后台轮询。")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: 安全

    private var securitySection: some View {
        Section("隐私与安全") {
            Picker("Face ID 锁定", selection: Binding(
                get: { environment.settings.biometricPolicy },
                set: { environment.settings.biometricPolicy = $0 }
            )) {
                ForEach(BiometricPolicy.allCases) { policy in
                    Text(policy.title).tag(policy)
                }
            }
            .disabled(!environment.biometricGate.isAvailable)
            .accessibilityLabel("生物识别锁定策略")

            Toggle("索引到 Spotlight 搜索", isOn: Binding(
                get: { environment.settings.spotlightEnabled },
                set: { value in
                    environment.settings.spotlightEnabled = value
                    Task { await environment.syncEngine.reindexSpotlight() }
                }
            ))
            .accessibilityHint("默认关闭，避免剪贴板内容出现在系统搜索中")

            Toggle("Widget 显示内容摘要", isOn: Binding(
                get: { WidgetBridge.showsContent },
                set: { WidgetBridge.showsContent = $0 }
            ))
            .accessibilityHint("关闭后小组件只显示占位，不会保留任何摘要")
            .onChange(of: WidgetBridge.showsContent) { _, _ in
                environment.syncEngine.publishWidgetSnapshot()
            }

            Button {
                environment.clipboard.clearPlaintextCache()
                toast = ToastMessage(text: "本地明文缓存已清空", style: .success)
            } label: {
                Label("清空本地明文缓存", systemImage: "eraser")
            }

            Button(role: .destructive) {
                showingSignOutConfirm = true
            } label: {
                Label("退出登录", systemImage: "rectangle.portrait.and.arrow.right")
            }
        }
    }

    // MARK: 通知

    private var notificationSection: some View {
        Section("通知") {
            Toggle("新的剪贴板", isOn: $notificationPrefs.newClipboard)
            Toggle("设备上线 / 离线", isOn: $notificationPrefs.deviceOnline)
            Toggle("新设备加入", isOn: $notificationPrefs.deviceAdded)
            Toggle("安全事件", isOn: $notificationPrefs.securityAlert)

            Button("请求系统通知权限") {
                Task {
                    let granted = await NotificationService.shared.requestAuthorization()
                    toast = ToastMessage(
                        text: granted ? "已开启通知" : "你拒绝了通知权限",
                        style: granted ? .success : .warning
                    )
                }
            }
        }
.onChange(of: notificationPrefs) { _, newValue in
            Task { await environment.prefs.setNotification(newValue) }
        }
    }

    // MARK: 设备

    private var deviceSection: some View {
        Section("设备") {
            NavigationLink {
                DevicesView()
            } label: {
                Label("管理设备", systemImage: "laptopcomputer.and.iphone")
            }

            HStack {
                Text("本机名称")
                Spacer()
                TextField("设备名称", text: $deviceName)
                    .multilineTextAlignment(.trailing)
                    .onSubmit {
                        environment.devices.setDeviceName(deviceName)
                        Task { await environment.devices.registerCurrentDevice() }
                    }
            }

            HStack {
                Text("设备 ID")
                Spacer()
                Text(environment.devices.deviceId)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
            }
            .font(.footnote)
        }
    }

    // MARK: 令牌

    private var tokenSection: some View {
        Section("API 令牌") {
            NavigationLink {
                TokenListView()
            } label: {
                Label("管理访问令牌", systemImage: "key.horizontal")
            }

            Button {
                Task {
                    let ok = await environment.devices.registerCurrentDevice()
                    toast = ToastMessage(
                        text: ok ? "设备注册成功" : "设备注册失败",
                        style: ok ? .success : .error
                    )
                }
            } label: {
                Label("重新注册本机设备", systemImage: "arrow.clockwise")
            }

            Text("令牌保存在钥匙串中，不会写入 UserDefaults。")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: 关于

    private var aboutSection: some View {
        Section("关于") {
            HStack {
                Text("客户端版本")
                Spacer()
                Text(Bundle.main.appVersion)
                    .foregroundStyle(.secondary)
            }
            HStack {
                Text("服务器")
                Spacer()
                Text(environment.settings.workerURL)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            HStack {
                Text("加密")
                Spacer()
                Text("AES-256-GCM + PBKDF2 310k")
                    .foregroundStyle(.secondary)
            }

            if let webURL = URL(string: environment.settings.workerURL) {
                Link(destination: webURL) {
                    Label("打开 Web 版", systemImage: "safari")
                }
            }
        }
    }
}

extension Bundle {
    var appVersion: String {
        let version = infoDictionary?["CFBundleShortVersionString"] as? String ?? "2.0.0"
        let build = infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(version) (\(build))"
    }
}
