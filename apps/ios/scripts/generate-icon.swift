import AppKit

// MARK: - 品牌色
let brandTop = NSColor(displayP3Red: 0.235, green: 0.518, blue: 0.988, alpha: 1) // #3C84FC
let brandBottom = NSColor(displayP3Red: 0.388, green: 0.357, blue: 0.941, alpha: 1) // #635BF0

let size = 1024

// MARK: - SF Symbols
func symbol(_ name: String, pointSize: CGFloat, weight: NSFont.Weight = .semibold, color: NSColor = .white) -> NSImage {
    guard let img = NSImage(systemSymbolName: name, accessibilityDescription: nil) else {
        fatalError("SF Symbol 不存在: \(name)")
    }
    let base = NSImage.SymbolConfiguration(pointSize: pointSize, weight: weight)
    let colored = NSImage.SymbolConfiguration(hierarchicalColor: color)
    let config = base.applying(colored)
    guard let configured = img.withSymbolConfiguration(config) else { return img }
    return configured
}

// MARK: - 画布
func makeCanvas() -> NSImage {
    NSImage(size: NSSize(width: size, height: size))
}

func render(_ image: NSImage, to url: URL) {
    guard let tiff = image.tiffRepresentation,
          let rep = NSBitmapImageRep(data: tiff),
          let png = rep.representation(using: .png, properties: [:]) else {
        fatalError("PNG 编码失败")
    }
    try? png.write(to: url)
    print("已生成: \(url.path) (\(png.count) bytes)")
}

// MARK: 1) 彩色正式图标（不透明，系统会按圆角遮罩）
func makeColoredIcon() -> NSImage {
    let img = makeCanvas()
    img.lockFocus()
    let bounds = NSRect(x: 0, y: 0, width: size, height: size)

    // 渐变底（全出血，圆角由系统遮罩）
    NSGradient(starting: brandTop, ending: brandBottom)?.draw(in: bounds, angle: 90)

    // 顶部柔光
    let glow = NSGradient(colors: [NSColor(white: 1, alpha: 0.22), NSColor(white: 1, alpha: 0)])!
    glow.draw(in: NSRect(x: -150, y: 560, width: 1324, height: 620), angle: -90)

    // 云（白色，居中）
    let cloud = symbol("cloud.fill", pointSize: 560, weight: .semibold, color: .white)
    cloud.draw(in: NSRect(x: bounds.midX - 400, y: bounds.midY - 380, width: 800, height: 800))

    // 剪贴板（深品牌色，叠在云中央）
    let ink = NSColor(displayP3Red: 0.16, green: 0.32, blue: 0.85, alpha: 1)
    let clip = symbol("doc.on.clipboard.fill", pointSize: 250, weight: .bold, color: ink)
    clip.draw(in: NSRect(x: bounds.midX - 190, y: bounds.midY - 220, width: 380, height: 380))

    img.unlockFocus()
    return img
}

// MARK: 2) 透明图标（透明底，品牌色云，挖空剪贴板）
func cgImage(from ns: NSImage) -> CGImage {
    var r = CGRect(origin: .zero, size: ns.size)
    guard let cg = ns.cgImage(forProposedRect: &r, context: nil, hints: nil) else {
        fatalError("无法取得 CGImage")
    }
    return cg
}

// AppKit 坐标（左上原点）→ CG 坐标（左下原点）
func cgRect(_ appRect: NSRect) -> CGRect {
    CGRect(x: appRect.minX, y: CGFloat(size) - appRect.maxY,
           width: appRect.width, height: appRect.height)
}

func makeTransparentIcon() -> NSImage {
    let img = makeCanvas()
    img.lockFocus()
    let bounds = NSRect(x: 0, y: 0, width: size, height: size)
    guard let ctx = NSGraphicsContext.current?.cgContext else {
        fatalError("无 CGContext")
    }

    let cloud = symbol("cloud.fill", pointSize: 560, weight: .semibold, color: .black)
    let clip = symbol("doc.on.clipboard.fill", pointSize: 255, weight: .bold, color: .black)
    let cloudAppRect = NSRect(x: bounds.midX - 400, y: bounds.midY - 400, width: 800, height: 800)
    let clipAppRect = NSRect(x: bounds.midX - 195, y: bounds.midY - 235, width: 390, height: 390)

    let space = CGColorSpace(name: CGColorSpace.displayP3)!
    let gradient = CGGradient(colorsSpace: space,
                              colors: [brandTop.cgColor, brandBottom.cgColor] as CFArray,
                              locations: [0, 1])!

    // 1) 用云形做蒙版，只在云区域画品牌渐变
    ctx.saveGState()
    ctx.clip(to: cgRect(cloudAppRect), mask: cgImage(from: cloud))
    ctx.drawLinearGradient(gradient,
                           start: CGPoint(x: 0, y: size),
                           end: CGPoint(x: 0, y: 0),
                           options: [])
    ctx.restoreGState()

    // 2) 用剪贴板形做蒙版，clear 挖空
    ctx.saveGState()
    ctx.setBlendMode(.clear)
    ctx.clip(to: cgRect(clipAppRect), mask: cgImage(from: clip))
    ctx.fill(CGRect(x: 0, y: 0, width: size, height: size))
    ctx.restoreGState()

    img.unlockFocus()
    return img
}

// MARK: - 输出
let assets = CommandLine.arguments.count > 1
    ? CommandLine.arguments[1]
    : "CloudClipboard/Resources/Assets.xcassets"
let iconSet = "\(assets)/AppIcon.appiconset"
let brandSet = "\(assets)/BrandIcon.imageset"
try? FileManager.default.createDirectory(atPath: iconSet, withIntermediateDirectories: true)
try? FileManager.default.createDirectory(atPath: brandSet, withIntermediateDirectories: true)

render(makeColoredIcon(), to: URL(fileURLWithPath: "\(iconSet)/AppIcon-1024.png"))
render(makeTransparentIcon(), to: URL(fileURLWithPath: "\(brandSet)/BrandIcon.png"))
print("完成")
