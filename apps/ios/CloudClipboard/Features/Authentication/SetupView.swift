//
//  SetupView.swift
//  CloudClipboard
//
//  引导页：配置 Worker + 登录 + 种子短语。
//
//  两个登录入口：
//    1. Cloudflare Access 登录（推荐）：系统浏览器走 Access 登录页，
//       回调带回 JWT，以 Cf-Access-Jwt-Assertion 头调用 API。
//    2. API Token（备用）：Web 端「设置 → API Token」生成，手动粘贴。
//       Worker 域名受 Access 保护时，App 会自动拉起一次浏览器登录再重试。
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
    @State private var headerAppeared = false

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
                VStack(alignment: .leading, spacing: 24) {
                    header
                        .opacity(headerAppeared ? 1 : 0)
                        .offset(y: headerAppeared ? 0 : 16)

                    GlassSurface(cornerRadius: 28) {
                        stepContent
                            .padding(22)
                    }
                    .id(step)
                    .transition(
                        .asymmetric(
                            insertion: .opacity.combined(with: .move(edge: .trailing).combined(with: .offset(y: 12))),
                            removal: .opacity.combined(with: .move(edge: .leading))
                        )
                    )
                    .animation(Motion.page, value: step)

                    if let errorMessage {
                        InlineErrorView(message: errorMessage)
                            .transition(.move(edge: .top).combined(with: .opacity))
                    }
                }
                .padding(20)
                .padding(.bottom, 24)
            }
            .scrollBounceBehavior(.basedOnSize)
            .navigationTitle("CloudClipboard")
            .navigationBarTitleDisplayMode(.inline)
            .toast($toast)
            .task {
                withAnimation(Motion.hero.delay(0.1)) { headerAppeared = true }
                // 已有任一凭证但缺种子短语时直接跳到第二步
                if environment.auth.hasCredentials, environment.auth.userId != nil {
                    step = .seed
                }
            }
            .animation(Motion.spring, value: errorMessage)
        }
    }

    // MARK: 头部

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            ZStack {
                Circle()
                    .fill(Color.accentColor.opacity(0.18))
                    .frame(width: 72, height: 72)
                    .blur(radius: 2)
                Image(systemName: "lock.shield.fill")
                    .font(Typography.font(size: 32, weight: .semibold, relativeTo: .largeTitle))
                    .foregroundStyle(.white)
                    .shadow(radius: 8)
            }
            .overlay {
                // 光环缓慢呼吸
                Circle()
                    .strokeBorder(Color.accentColor.opacity(0.5), lineWidth: 1.5)
                    .frame(width: 84, height: 84)
                    .scaleEffect(headerAppeared ? 1 : 0.85)
                    .opacity(headerAppeared ? 0.6 : 0)
                    .animation(.easeOut(duration: 2.2).repeatForever(autoreverses: true), value: headerAppeared)
            }
            .accessibilityHidden(true)

            Text("跨设备私有剪贴板")
                .font(Typography.title2Semibold)
                .tracking(-0.02)
            Text("端到端加密，服务器永远看不到明文。")
                .font(Typography.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: 步骤内容

    @ViewBuilder
    private var stepContent: some View {
        switch step {
        case .server: serverStep
        case .seed: seedStep
        }
    }

    private var serverStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            stepIndicator

            LabeledField(
                title: "服务器地址",
                placeholder: SharedSettings.defaultWorkerURL,
                text: $workerURL,
                keyboard: .URL,
                footnote: "你的 CloudClipboard Worker 域名（https 开头）"
            )

            // 入口一：Cloudflare Access 登录
            Button {
                Task { await connectWithAccess() }
            } label: {
                HStack(spacing: 8) {
                    if isBusy {
                        ProgressView().controlSize(.small).tint(.white)
                    } else {
                        Image(systemName: "lock.shield")
                    }
                    Text(isBusy ? "正在登录…" : "使用 Cloudflare Access 登录")
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .clipShape(Capsule())
            .disabled(isBusy)

            HStack(spacing: 10) {
                Rectangle().frame(height: 1).foregroundStyle(.separator)
                Text("或").font(Typography.caption2).foregroundStyle(.secondary)
                Rectangle().frame(height: 1).foregroundStyle(.separator)
            }

            // 入口二：API Token（备用）
            LabeledField(
                title: "访问令牌（备用）",
                placeholder: "cca_...",
                text: $apiToken,
                isSecure: true,
                footnote: "在 Web 端「设置 → API Token」生成"
            )

            Button {
                Task { await connectWithToken() }
            } label: {
                HStack(spacing: 8) {
                    if isBusy { ProgressView().controlSize(.small) }
                    Text(isBusy ? "正在验证…" : "用令牌连接")
                        .fontWeight(.medium)
                }
                .frame(maxWidth: .infinity)
            }
            .adaptiveGlassButton()
            .controlSize(.large)
            .disabled(isBusy || apiToken.trimmingCharacters(in: .whitespaces).isEmpty)

            Button("只测试连通性") {
                Task { await testConnection() }
            }
            .font(Typography.footnote)
            .foregroundStyle(.secondary)
            .disabled(isBusy)
        }
    }

    private var seedStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            stepIndicator

            HStack(spacing: 10) {
                Image(systemName: "checkmark.seal.fill")
                    .foregroundStyle(.green)
                Text("已连接（\(environment.auth.method.displayName)）")
                    .font(Typography.subheadlineMedium)
            }

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
                    .fontWeight(.semibold)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .clipShape(Capsule())
            .disabled(seedPhrase.trimmingCharacters(in: .whitespaces).count < 8)

            Text("种子短语错误会导致无法解密历史记录，请与 Web 端保持一致。")
                .font(Typography.caption)
                .foregroundStyle(.secondary)

            Button {
                environment.auth.signOut()
                withAnimation(Motion.page) { step = .server }
                apiToken = ""
                seedPhrase = ""
            } label: {
                Label("换一个账号", systemImage: "arrow.left")
                    .font(Typography.footnote)
            }
            .foregroundStyle(.secondary)
        }
    }

    /// 顶部步骤指示器（两个圆点 + 连线）
    private var stepIndicator: some View {
        HStack(spacing: 8) {
            ForEach(Step.allCases, id: \.self) { s in
                let active = s == step
                Circle()
                    .fill(active ? Color.accentColor : Color.secondary.opacity(0.25))
                    .frame(width: 8, height: 8)
                    .animation(Motion.quick, value: step)
                if s == .server {
                    Rectangle()
                        .fill(Color.secondary.opacity(step == .seed ? 0.4 : 0.2))
                        .frame(width: 32, height: 1.5)
                }
            }
            Spacer(minLength: 0)
            Text(step.title)
                .font(Typography.captionSemibold)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: 动作

    /// 入口一：Access 浏览器登录
    @MainActor
    private func connectWithAccess() async {
        isBusy = true
        errorMessage = nil
        defer { isBusy = false }

        guard let baseURL = validatedBaseURL() else {
            errorMessage = "服务器地址格式不正确"
            return
        }

        do {
            let jwt = try await AccessLoginService().signIn(baseURL: baseURL)
            environment.auth.signInWithAccess(workerURL: workerURL, jwt: jwt)
            await environment.refreshAPIConfiguration()
            await environment.auth.refreshIdentity()
        } catch let error as AccessLoginError {
            if case .cancelled = error { return }
            errorMessage = error.localizedDescription
            return
        } catch {
            errorMessage = "登录失败，请重试"
            return
        }

        finishLogin()
    }

    /// 入口二：API Token；若被边缘 Access 拦截，自动补一次浏览器登录再重试
    @MainActor
    private func connectWithToken() async {
        isBusy = true
        errorMessage = nil
        defer { isBusy = false }

        environment.auth.signIn(workerURL: workerURL, apiToken: apiToken)
        await environment.refreshAPIConfiguration()
        await environment.auth.refreshIdentity()

        if environment.auth.needsAccessLogin {
            guard let baseURL = validatedBaseURL() else {
                errorMessage = "服务器地址格式不正确"
                return
            }
            do {
                let jwt = try await AccessLoginService().signIn(baseURL: baseURL)
                environment.auth.attachAccessJwt(jwt)
                await environment.refreshAPIConfiguration()
                await environment.auth.refreshIdentity()
            } catch let error as AccessLoginError {
                if case .cancelled = error {
                    errorMessage = environment.auth.lastError ?? "请求被 Cloudflare Access 拦截"
                } else {
                    errorMessage = error.localizedDescription

                }
                return
            } catch {
                errorMessage = "登录失败，请重试"
                return
            }
        }

        finishLogin()
    }

    @MainActor
    private func finishLogin() {
        switch environment.auth.state {
        case .ready, .needsSeedPhrase:
            environment.haptics.synced()
            withAnimation(Motion.page) { step = .seed }
        case .expired(let message):
            environment.haptics.failed()
            errorMessage = message.isEmpty ? "登录凭证无效或已过期" : message
        case .unconfigured:
            environment.haptics.failed()
            errorMessage = environment.auth.lastError ?? "无法连接服务器，请检查地址与凭证"
        }
    }

    private func validatedBaseURL() -> URL? {
        let trimmed = workerURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed), url.host != nil else { return nil }
        return url
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
        } catch let error as APIError {
            errorMessage = error.localizedDescription
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
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(Typography.captionSemibold)
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
            .font(Typography.body)
            .textFieldStyle(.plain)
            .padding(14)
            .background {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color.primary.opacity(0.05))
                    .overlay {
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.6)
                    }
            }
            .accessibilityLabel(title)

            if let footnote {
                Text(footnote)
                    .font(Typography.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

struct InlineErrorView: View {
    let message: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(Typography.footnote)
                .foregroundStyle(.orange)
                .accessibilityHidden(true)
            Text(message)
                .font(Typography.footnote)
                .foregroundStyle(.orange.opacity(0.95))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.orange.opacity(0.12))
                .overlay {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .strokeBorder(Color.orange.opacity(0.25), lineWidth: 0.6)
                }
        }
        .accessibilityElement(children: .combine)
    }
}
