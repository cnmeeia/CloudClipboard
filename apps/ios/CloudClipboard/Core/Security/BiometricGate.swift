//
//  BiometricGate.swift
//  CloudClipboard
//
//  Face ID / Touch ID 保护（LocalAuthentication）。
//  只用系统 API 做「用户在场」校验，绝不自己实现密码学认证。
//
//  保护时机（Settings → Privacy → Require Face ID）：
//    - never / immediately / after1Minute / after5Minute
//

import Foundation
import LocalAuthentication

public enum BiometricPolicy: String, CaseIterable, Sendable, Identifiable {
    case never
    case immediately
    case after1Minute
    case after5Minute

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .never: return "从不"
        case .immediately: return "立即"
        case .after1Minute: return "1 分钟后"
        case .after5Minute: return "5 分钟后"
        }
    }

    /// 进入后台后需要重新认证的间隔（秒）
    public var graceInterval: TimeInterval? {
        switch self {
        case .never: return nil
        case .immediately: return 0
        case .after1Minute: return 60
        case .after5Minute: return 300
        }
    }
}

public enum BiometricError: Error, LocalizedError {
    case unavailable
    case failed(String)

    public var errorDescription: String? {
        switch self {
        case .unavailable: return "此设备未启用 Face ID / Touch ID"
        case .failed(let reason): return reason
        }
    }
}

@MainActor
public final class BiometricGate {
    private let context = LAContext()
    private var lastUnlockedAt: Date

    public init() {
        // 启动即视为「刚刚解锁」，避免冷启动立刻弹窗
        lastUnlockedAt = Date()
    }

    public var biometryType: LABiometryType {
        var error: NSError?
        _ = context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error)
        return context.biometryType
    }

    public var biometryName: String {
        switch biometryType {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        case .opticID: return "Optic ID"
        default: return "生物识别"
        }
    }

    public var isAvailable: Bool {
        var error: NSError?
        return LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: &error)
    }

    /// 不弹窗地判断：按 policy 是否已超过宽限期（用于 scenePhase 切换时决定要不要锁）
    public func needsAuth(now: Date = Date(), policy: BiometricPolicy) -> Bool {
        guard let grace = policy.graceInterval else { return false }
        return now.timeIntervalSince(lastUnlockedAt) >= grace
    }

    /// 记录一次成功解锁（例如刚完成认证，或用户主动解锁）
    public func markUnlocked(at date: Date = Date()) {
        lastUnlockedAt = date
    }

    /// 主动要求认证。`reason` 会显示在系统弹窗上（不要写入敏感信息）。
    @discardableResult
    public func authenticate(reason: String, policy: BiometricPolicy) async throws -> Bool {
        guard policy != .never else {
            markUnlocked()
            return true
        }
        guard isAvailable else { throw BiometricError.unavailable }

        let context = LAContext()
        context.localizedReason = reason
        context.localizedCancelTitle = "稍后"

        do {
            let ok = try await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)
            if ok { markUnlocked() }
            return ok
        } catch {
            throw BiometricError.failed(error.localizedDescription)
        }
    }
}
