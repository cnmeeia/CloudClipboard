//
//  SetupView.swift
//  CloudClipboard
//
//  引导页：配置 Worker + API Token + 种子短语。
//
//  为什么用 API Token（见 docs/ios-audit.md §2）：
//    Cloudflare Access 是浏览器 Cookie 流程，原生 App 无法获得 Access JWT。
//    Worker 已支持 `Authorization: Bearer cca_...`，因此 iOS 走 API Token，
//    且 userId 与 Web 完全一致 → E2EE 密文互通。
//

import SwiftUI

struct SetupView: View {
    @Environment(AppEnvironment.self) private var environment

    @State private var step: Step = .server
    @State private var workerURL: String = SharedSettings().workerURL
    @State private var apiToken: String = ""
    @State private var seedPhrase: String = ""
    @State private var isBusy = false
    @State private var errorMessage: String?
    @State private var toast: ToastMessage?

    enum Step: Int, CaseIterable {
        case server, seed

        var title: String {
            switch self {
            case .server: return "连接服务器"
            case .seed: return "解锁加密"
            }
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    header

                    switch step {
                    case .server: serverStep
                    case .seed: seedStep
                    }

                    if let errorMessage {
                        InlineErrorView(message: errorMessage)
                    }
                }
                .padding(20)
            }
            .background(AppBackground())
            .navigationTitle("CloudClipboard")
            .navigationBarTitleDisplayMode(.large)
            .toast($toast)
            .task {
                // Token 已存在但缺种子短语时直接跳到第二步
                if environment.auth.hasToken, environment.auth.userId != nil {
                    step = .seed
                }
            }
        }
    }

    // MARK: 头部

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: "doc.on.clipboard.fill")
                .font(.system(size: 36))
                .foregroundStyle(Color.accentColor)
                .accessibilityHidden(true)

            Text("跨设备私有剪贴板")
                .font(.title2.weight(.bold))
            Text("端到端加密，服务器永远看不到明文。复用你现有的 CloudClipboard 云端。")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: 第一步

    private var serverStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            LabeledField(
                title: "服务器地址",
                placeholder: SharedSettings.defaultWorkerURL,
                text: $workerURL,
                keyboard: .URL,
                footnote: "默认使用现有 CloudClipboard 域名"
            )

            LabeledField(
                title: "访问令牌",
                placeholder: "cca_...",
                text: $apiToken,
                isSecure: true,
                footnote: "在 Web 端「设置 → API Token」生成，复制到这里"
            )

            Button {
                Task { await connect() }
            } label: {
                HStack {
                    if isBusy { ProgressView().controlSize(.small) }
                    Text(isBusy ? "正在验证…" : "连接")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(isBusy || apiToken.trimmingCharacters(in: .whitespaces).isEmpty)

            Button("只测试连通性") {
                Task { await testConnection() }
            }
            .font(.footnote)
            .disabled(isBusy)
        }
    }

    // MARK: 第二步

    private var seedStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 8) {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                Text("已连接，用户 ID 已确认")
                    .font(.subheadline)
            }
            .accessibilityElement(children: .combine)

            LabeledField(
                title: "种子短语",
                placeholder: "与 Web 端相同的种子短语",
                text: $seedPhrase,
                isSecure: true,
                footnote: "只保存在本机钥匙串，用于派生 AES-256 主密钥（PBKDF2 310,000 次）"
            )

            Button {
                unlock()
            } label: {
                Text("解锁并进入")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(seedPhrase.trimmingCharacters(in: .whitespaces).count < 8)

            Text("种子短语错误会导致无法解密历史记录，请与 Web 端保持一致。")
                .font(.caption)
                .foregroundStyle(.secondary)

            Button("换一个账号") {
                environment.auth.signOut()
                step = .server
                apiToken = ""
                seedPhrase = ""
            }
            .font(.footnote)
        }
    }

    // MARK: 动作

    private func connect() async {
        isBusy = true
        errorMessage = nil
        defer { isBusy = false }

        await environment.auth.signIn(workerURL: workerURL, apiToken: apiToken)
        await environment.refreshAPIConfiguration()

        switch environment.auth.state {
        case .ready, .needsSeedPhrase:
            environment.haptics.synced()
            step = .seed
        case .expired(let message):
            environment.haptics.failed()
            errorMessage = message.isEmpty ? "访问令牌无效或已过期" : message
        case .unconfigured:
            environment.haptics.failed()
            errorMessage = environment.auth.lastError ?? "无法连接服务器，请检查地址与令牌"
        }
    }

    private func testConnection() async {
        isBusy = true
        errorMessage = nil
        defer { isBusy = false }
        do {
            let trimmed = workerURL.trimmingCharacters(in: .whitespacesAndNewlines)
            guard let url = URL(string: trimmed) else {
                errorMessage = "服务器地址格式不正确"
                return
            }
            let health = try await APIClient(configurationProvider: MutableConfigurationStore()).healthCheck(baseURL: url)
            toast = ToastMessage(
                text: "服务器可用",
                style: .success,
                detail: "\(health.service ?? "CloudClipboard") \(health.version ?? "")"
            )
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "无法连接服务器"
        }
    }

    private func unlock() {
        if environment.auth.setSeedPhrase(seedPhrase) {
            environment.haptics.synced()
            environment.clipboard.clearPlaintextCache()
        } else {
            environment.haptics.failed()
            errorMessage = environment.auth.lastError ?? "种子短语不可用"
        }
    }
}

// MARK: - 小组件

struct LabeledField: View {
    let title: String
    let placeholder: String
    @Binding var text: String
    var isSecure = false
    var keyboard: UIKeyboardType = .default
    var footnote: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)

            Group {
                if isSecure {
                    SecureField(placeholder, text: $text)
                } else {
                    TextField(placeholder, text: $text)
                        .keyboardType(keyboard)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
            }
            .textFieldStyle(.plain)
            .padding(12)
            .background { GlassSurface(cornerRadius: 12) { Color.clear } }
            .accessibilityLabel(title)

            if let footnote {
                Text(footnote)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

struct InlineErrorView: View {
    let message: String

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
                .accessibilityHidden(true)
            Text(message)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}
