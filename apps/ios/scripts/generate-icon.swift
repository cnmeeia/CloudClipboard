import AppKit

// MARK: - 品牌色
let brandTop = NSColor(displayP3Red: 0.235, green: 0.518, blue: 0.988, alpha: 1) // #3C84FC
let brandBottom = NSColor(displayP3Red: 0.388, green: 0.357, blue: 0.941, alpha: 1) // #635BF0
let size = 1024

// MARK: - SF Symbols（显式着色）
func symbol(_ name: String, pointSize: CGFloat, weight: NSFont.Weight, color: NSColor) -> NSImage {
    guard let img = NSImage(systemSymbolName: name, accessibilityDescription: nil) else {
        fatalError("SF Symbol 不存在: \(name)")
    }
    let base = NSImage.SymbolConfiguration(pointSize: pointSize, weight: weight)
    let colored = NSImage.SymbolConfiguration(hierarchicalColor: color)
    guard let configured = img.withSymbolConfiguration(base.applying(colored)) else { return img }
    return configured
}

func cgImage(from ns: NSImage) -> CGImage {
    var r = CGRect(origin: .zero, size: ns.size)
    guard let cg = ns.cgImage(forProposedRect: &r, context: nil, hints: nil) else {
        fatalError("无法取得 CGImage")
    }
    return cg
}

// AppKit（左上原点）→ CG（左下原点）
func cgRect(_ r: CGRect) -> CGRect {
    CGRect(x: r.minX, y: CGFloat(size) - r.maxY, width: r.width, height: r.height)
}

// MARK: - PNG 输出
func savePng(from ctx: CGContext, to path: String) {
    guard let cg = ctx.makeImage() else { fatalError("makeImage 失败") }
    let rep = NSBitmapImageRep(cgImage: cg)
    guard let png = rep.representation(using: .png, properties: [:]) else { fatalError("PNG 编码失败") }
    try? png.write(to: URL(fileURLWithPath: path))
    print("已生成: \(path) (\(png.count) bytes)")
}

// MARK: - 创建位图上下文（opaque=true 时无 alpha）
func makeContext(opaque: Bool) -> CGContext {
    let cs = CGColorSpaceCreateDeviceRGB()
    let bmInfo = opaque ? CGImageAlphaInfo.noneSkipLast.rawValue : CGImageAlphaInfo.premultipliedLast.rawValue
    guard let ctx = CGContext(data: nil, width: size, height: size,
                              bitsPerComponent: 8, bytesPerRow: 0, space: cs,
                              bitmapInfo: bmInfo) else {
        fatalError("无法创建上下文")
    }
    return ctx
}

// 画品牌纵向渐变（CG 坐标：从下到上 brandBottom→brandTop）
func drawBrandGradient(in ctx: CGContext, clipRect: CGRect? = nil, mask: CGImage? = nil) {
    let space = CGColorSpaceCreateDeviceRGB()
    let colors = [brandBottom.cgColor, brandTop.cgColor] as CFArray
    guard let grad = CGGradient(colorsSpace: space, colors: colors, locations: [0, 1]) else { return }
    ctx.saveGState()
    if let mask {
        let rect = clipRect ?? CGRect(x: 0, y: 0, width: size, height: size)
        ctx.clip(to: rect, mask: mask)
    } else if let clipRect {
        ctx.clip(to: clipRect)
    }
    ctx.drawLinearGradient(grad, start: CGPoint(x: 0, y: 0), end: CGPoint(x: 0, y: size), options: [])
    ctx.restoreGState()
}

// MARK: 1) 彩色正式图标（不透明，全出血；圆角由系统遮罩）
func makeColoredIcon(to path: String) {
    let ctx = makeContext(opaque: true)
    let bounds = CGRect(x: 0, y: 0, width: size, height: size)

    // 底渐变（不透明）
    drawBrandGradient(in: ctx)

    // 白云
    let cloud = symbol("cloud.fill", pointSize: 560, weight: .semibold, color: .white)
    let cloudAppRect = CGRect(x: bounds.midX - 400, y: bounds.midY - 400, width: 800, height: 800)
    ctx.saveGState()
    ctx.clip(to: cgRect(cloudAppRect), mask: cgImage(from: cloud))
    ctx.setFillColor(NSColor.white.cgColor)
    ctx.fill(bounds)
    ctx.restoreGState()

    // 深蓝剪贴板叠在云中央
    let ink = NSColor(displayP3Red: 0.16, green: 0.32, blue: 0.85, alpha: 1)
    let clip = symbol("doc.on.clipboard.fill", pointSize: 250, weight: .bold, color: ink)
    let clipAppRect = CGRect(x: bounds.midX - 190, y: bounds.midY - 220, width: 380, height: 380)
    ctx.saveGState()
    ctx.clip(to: cgRect(clipAppRect), mask: cgImage(from: clip))
    ctx.setFillColor(ink.cgColor)
    ctx.fill(bounds)
    ctx.restoreGState()

    savePng(from: ctx, to: path)
}

// MARK: 2) 透明品牌图标（透明底，品牌色云，挖空剪贴板）
func makeTransparentIcon(to path: String) {
    let ctx = makeContext(opaque: false)
    let bounds = CGRect(x: 0, y: 0, width: size, height: size)

    // 云形内画品牌渐变
    let cloud = symbol("cloud.fill", pointSize: 560, weight: .semibold, color: .black)
    let cloudAppRect = CGRect(x: bounds.midX - 400, y: bounds.midY - 400, width: 800, height: 800)
    drawBrandGradient(in: ctx, clipRect: cgRect(cloudAppRect), mask: cgImage(from: cloud))

    // 剪贴板挖空
    let clip = symbol("doc.on.clipboard.fill", pointSize: 255, weight: .bold, color: .black)
    let clipAppRect = CGRect(x: bounds.midX - 195, y: bounds.midY - 235, width: 390, height: 390)
    ctx.saveGState()
    ctx.setBlendMode(.clear)
    ctx.clip(to: cgRect(clipAppRect), mask: cgImage(from: clip))
    ctx.fill(bounds)
    ctx.restoreGState()

    savePng(from: ctx, to: path)
}

// MARK: - 输出（路径写死）
let assets = "CloudClipboard/Resources/Assets.xcassets"
makeColoredIcon(to: "\(assets)/AppIcon.appiconset/AppIcon-1024.png")
makeTransparentIcon(to: "\(assets)/BrandIcon.imageset/BrandIcon.png")
print("完成")
