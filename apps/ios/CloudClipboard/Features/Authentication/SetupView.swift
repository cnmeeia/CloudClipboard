//
//  SetupView.swift
//  CloudClipboard
//
//  引导页：配置 Worker + 登录 + 种子短语。
//
//  两个登录入口（见 docs/ios-audit.md §2）：
//    1. Cloudflare Access 登录（推荐）：系统浏览器走 Access 登录页，
//       App 从 CF_Authorization cookie 取 JWT，以 Cf-Access-Jwt-Assertion 头调用 API。
//       Worker 用 team JWKS 验签，userId 与 Web 端一致 → E2EE 密文互通。
//    2. API Token（备用）：Web 端「设置 → API Token」生成，手动粘贴。
//       注意：Worker 域名受 Cloudflare Access 保护时，Token 直连会被边缘拦截；
//       此时 App 会自动拉起一次浏览器 Access 登录拿到会话，再用 Token 完成校验。
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
                // 已有任一凭证但缺种子短语时直接跳到第二步
                if environment.auth.hasCredentials, environment.auth.userId != nil {
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
                footnote: "你的 CloudClipboard Worker 域名（https 开头）"
            )

            // 入口一：Cloudflare Access 登录
            Button {
                Task { await connectWithAccess() }
            } label: {
                HStack {
                    if isBusy { ProgressView().controlSize(.small) }
                    Image(systemName: "lock.shield")
                    Text(isBusy ? "正在登录…" : "使用 Cloudflare Access 登录")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(isBusy)

            Text("推荐：在系统浏览器中完成验证，无需手动复制令牌。")
                .font(.caption)
                .foregroundStyle(.secondary)

            HStack(spacing: 8) {
                Rectangle().frame(height: 1).foregroundStyle(.separator)
                Text("或").font(.caption).foregroundStyle(.secondary)
                Rectangle().frame(height: 1).foregroundStyle(.separator)
            }

            // 入口二：API Token（备用）
            LabeledField(
                title: "访问令牌（备用）",
                placeholder: "cca_...",
                text: $apiToken,
                isSecure: true,
                footnote: "在 Web 端「设置 → API Token」生成，复制到这里"
            )

            Button {
                Task { await connectWithToken() }
            } label: {
                HStack {
                    if isBusy { ProgressView().controlSize(.small) }
                    Text(isBusy ? "正在验证…" : "用令牌连接")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
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
                Text("已连接（\(environment.auth.method.displayName)），用户 ID 已确认")
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
            if case .cancelled = error { return } // 用户取消，静默
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
            // Token 直连被 Cloudflare Access 拦截 → 拉起浏览器拿会话
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
                    // 保留拦截提示，让用户知道为什么连不上
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
            step = .seed
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
            // 被 Access 拦截时给出明确指引，而不是「无法解析的数据」
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
