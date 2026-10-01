//
//  RetryPolicy.swift
//  CloudClipboard
//
//  指数退避重试。仅用于可重试错误（离线 / 超时 / 429 / 5xx）。
//

import Foundation

public struct RetryPolicy: Sendable, Equatable {
    public let maxRetries: Int
    public let baseDelay: TimeInterval
    public let maxDelay: TimeInterval

    public init(maxRetries: Int, baseDelay: TimeInterval, maxDelay: TimeInterval) {
        self.maxRetries = maxRetries
        self.baseDelay = baseDelay
        self.maxDelay = maxDelay
    }

    public static let `default` = RetryPolicy(maxRetries: 3, baseDelay: 0.6, maxDelay: 8)
    public static let none = RetryPolicy(maxRetries: 0, baseDelay: 0, maxDelay: 0)
    /// 后台任务用短策略，避免超出系统给的执行窗口
    public static let background = RetryPolicy(maxRetries: 2, baseDelay: 1, maxDelay: 4)

    /// 第 `attempt` 次失败后的等待时长：base * 2^attempt，带 ±20% 抖动，且尊重 Retry-After
    public func delay(forAttempt attempt: Int, error: APIError) -> TimeInterval {
        if case .rateLimited(let retryAfter) = error, let retryAfter {
            return min(max(retryAfter, 0.5), maxDelay)
        }
        let exponential = baseDelay * pow(2, Double(attempt))
        let jitter = exponential * Double.random(in: 0.8...1.2)
        return min(jitter, maxDelay)
    }
}
