//
//  DateFormatting.swift
//  CloudClipboard
//
//  列表分组用的「今天 / 昨天 / 本周 / 更早」与相对时间显示。
//

import Foundation

public enum ClipboardDateFormatting {
    /// 列表分组标题
    public static func sectionTitle(for date: Date, now: Date = Date(), calendar: Calendar = .current) -> String {
        if calendar.isDateInToday(date) { return "今天" }
        if calendar.isDateInYesterday(date) { return "昨天" }
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: date), to: calendar.startOfDay(for: now)).day ?? 0
        if days < 7 { return "本周" }
        if days < 30 { return "本月" }
        return "更早"
    }

    /// 相对时间（刚刚 / 5 分钟前 / 昨天 14:32 / 3月2日）
    public static func relative(for date: Date, now: Date = Date(), calendar: Calendar = .current) -> String {
        let interval = now.timeIntervalSince(date)
        if interval < 60 { return "刚刚" }
        if interval < 3600 { return "\(Int(interval / 60)) 分钟前" }
        if calendar.isDateInToday(date) {
            return DateFormatter.localizedString(from: date, dateStyle: .none, timeStyle: .short)
        }
        if calendar.isDateInYesterday(date) { return "昨天 " + shortTime(date) }
        let days = calendar.dateComponents([.day], from: date, to: now).day ?? 0
        if days < 7 { return "\(days) 天前" }
        let formatter = DateFormatter()
        formatter.locale = Locale.current
        formatter.setLocalizedDateFormatFromTemplate("MMMd")
        return formatter.string(from: date)
    }

    public static func shortTime(_ date: Date) -> String {
        DateFormatter.localizedString(from: date, dateStyle: .none, timeStyle: .short)
    }

    /// 剩余有效期描述（用于 TTL 展示）
    public static func expiry(for date: Date?, now: Date = Date()) -> String? {
        guard let date else { return "永久" }
        let interval = date.timeIntervalSince(now)
        if interval <= 0 { return "已过期" }
        // 按单位四舍五入，避免调用方与此处取 now 的微小差异在整点边界产生截断跳变
        let minutes = (interval / 60).rounded()
        if minutes < 60 { return "\(max(1, Int(minutes))) 分钟后过期" }
        let hours = (interval / 3600).rounded()
        if hours < 24 { return "\(Int(hours)) 小时后过期" }
        return "\(Int((interval / 86_400).rounded())) 天后过期"
    }
}
