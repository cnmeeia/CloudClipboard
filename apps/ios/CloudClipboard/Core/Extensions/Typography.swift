import SwiftUI

/// 全局排版：统一使用 Apple「苹方」PingFang SC，并按系统动态字号缩放。
/// 代码/等宽场景仍保留系统等宽字体（见 ContentRenderer）。
public enum Typography {

    public enum Weight {
        case regular, medium, semibold

        var fontName: String {
            switch self {
            case .regular: return "PingFangSC-Regular"
            case .medium: return "PingFangSC-Medium"
            case .semibold: return "PingFangSC-Semibold"
            }
        }

        init(_ swift: Font.Weight) {
            switch swift {
            case .medium: self = .medium
            case .semibold, .bold, .heavy, .black: self = .semibold
            default: self = .regular
            }
        }
    }

    /// 以苹方构造字体，并用 UIFontMetrics 跟随系统动态字号
    public static func font(size: CGFloat, weight: Weight = .regular,
                            relativeTo textStyle: UIFont.TextStyle = .body) -> Font {
        let base = UIFont(name: weight.fontName, size: size) ?? .systemFont(ofSize: size)
        let scaled = UIFontMetrics(forTextStyle: textStyle).scaledFont(for: base)
        return Font(scaled)
    }

    // MARK: - 语义字号（Apple HIG 标准点值，正文略加提升以增强可读性）
    public static let largeTitle      = font(size: 34, weight: .regular, relativeTo: .largeTitle)
    public static let title           = font(size: 28, weight: .regular, relativeTo: .title1)
    public static let title2          = font(size: 22, weight: .regular, relativeTo: .title2)
    public static let title2Semibold  = font(size: 22, weight: .semibold, relativeTo: .title2)
    public static let title3          = font(size: 20, weight: .regular, relativeTo: .title3)
    public static let title3Semibold  = font(size: 20, weight: .semibold, relativeTo: .title3)
    public static let headline        = font(size: 17, weight: .semibold, relativeTo: .headline)
    public static let body            = font(size: 17, weight: .regular, relativeTo: .body)
    public static let callout         = font(size: 16, weight: .regular, relativeTo: .callout)
    public static let subheadline     = font(size: 15, weight: .regular, relativeTo: .subheadline)
    public static let subheadlineMedium   = font(size: 15, weight: .medium, relativeTo: .subheadline)
    public static let subheadlineSemibold = font(size: 15, weight: .semibold, relativeTo: .subheadline)
    public static let footnote        = font(size: 13, weight: .regular, relativeTo: .footnote)
    public static let footnoteMedium  = font(size: 13, weight: .medium, relativeTo: .footnote)
    public static let footnoteSemibold = font(size: 13, weight: .semibold, relativeTo: .footnote)
    public static let caption         = font(size: 12, weight: .regular, relativeTo: .caption1)
    public static let captionSemibold = font(size: 12, weight: .semibold, relativeTo: .caption1)
    public static let caption2        = font(size: 11, weight: .regular, relativeTo: .caption2)
    public static let caption2Semibold = font(size: 11, weight: .semibold, relativeTo: .caption2)
}
