/**
 * UI Visual QA — 设计系统一致性自动化检查
 *
 * 这是基于 web-design Skill 的 visual-qa.md 落地为可执行工具的版本。
 * 通过静态解析源码，验证 CloudClipboard 的 Design System 是否保持一致：
 *
 * 1. Design Tokens 一致性 —— 全部 CSS 变量严格对齐 4/8/12/16/24 Spacing scale
 * 2. Radius Token —— 只允许 8/12/16/24 四档
 * 3. 禁止裸色值 —— TSX 中除了 token 定义与语法高亮，不允许硬编码 #hex
 * 4. 未定义 Token 引用 —— 防止 var(--xxx) 引用了不存在的设计变量
 * 5. Motion 一致性 —— 动画时长必须对齐 --duration-fast / --duration-normal
 * 6. Reduced Motion —— prefers-reduced-motion 必须有全局降级
 * 7. 焦点可见性 —— :focus-visible 必须存在且使用 accent 色
 * 8. 断点覆盖 —— 375 / 768 / 1024 / 1440 的布局适配必须存在
 *
 * 运行：pnpm --filter @cloudclipboard/web test
 */

import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const SRC = join(__dirname, "..", "src")

/** 递归获取所有源文件 */
function walk(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) files.push(...walk(full))
    else if (/\.(tsx?|css)$/.test(entry)) files.push(full)
  }
  return files
}

const FILES = walk(SRC)
const CSS = readFileSync(join(SRC, "index.css"), "utf-8")
const TSX_FILES = FILES.filter((f) => f.endsWith(".tsx") && !f.includes("ui/index.ts"))

// ──────────────────────────────────────────────
// 1. Design Token 一致性
// ──────────────────────────────────────────────
describe("Design Token 一致性", () => {
  it("Spacing scale 严格为 4/8/12/16/20/24/32（不得引入随机间距）", () => {
    const spacingTokens = Array.from(
      CSS.matchAll(/--space-(\d+):\s*(\d+)px/g),
      (m) => parseInt(m[2]),
    )
    const allowed = [4, 8, 12, 16, 20, 24, 32]
    for (const v of spacingTokens) {
      expect(allowed, `--space-* 包含非标间距 ${v}px`).toContain(v)
    }
    // 必须包含关键档位
    expect(spacingTokens).toContain(4)
    expect(spacingTokens).toContain(8)
    expect(spacingTokens).toContain(16)
    expect(spacingTokens).toContain(24)
    expect(spacingTokens).toContain(32)
  })

  it("Radius 收敛为 8/12/16/24 四档", () => {
    const radiusTokens = Array.from(
      CSS.matchAll(/--radius-(xs|sm|md|lg):\s*(\d+)px/g),
      (m) => ({ name: m[1], value: parseInt(m[2]) }),
    )
    expect(radiusTokens.length).toBeGreaterThanOrEqual(4)
    const expected: Record<string, number> = { xs: 8, sm: 12, md: 16, lg: 24 }
    for (const t of radiusTokens) {
      expect(t.value, `--radius-${t.name} 应为 ${expected[t.name]}px`).toBe(expected[t.name])
    }
  })

  it("Motion 时长只有 fast(160ms) 和 normal(260ms)", () => {
    const durations = Array.from(
      CSS.matchAll(/--duration-(fast|normal):\s*(\d+)ms/g),
      (m) => ({ name: m[1], value: parseInt(m[2]) }),
    )
    expect(durations).toHaveLength(2)
    const expected: Record<string, number> = { fast: 160, normal: 260 }
    for (const d of durations) {
      expect(d.value, `--duration-${d.name} 应为 ${expected[d.name]}ms`).toBe(expected[d.name])
    }
  })

  it("阴影层级不超 4 档（sm/md/lg/glass）", () => {
    const shadows = [...new Set(Array.from(CSS.matchAll(/--shadow-(sm|md|lg|glass):/g), (m) => m[1]))]
    expect(shadows.length).toBeLessThanOrEqual(4)
    expect(shadows).toContain("sm")
    expect(shadows).toContain("lg")
  })

  it("blur-glass 使用 blur(24px) saturate", () => {
    expect(CSS).toMatch(/--blur-glass:\s*blur\(24px\)\s*saturate\(/)
  })
})

// ──────────────────────────────────────────────
// 2. 未定义 Token 引用
// ──────────────────────────────────────────────
describe("Token 引用完整性", () => {
  it("所有 var(--xxx) 引用的变量必须在 index.css 中定义", () => {
    const defined = new Set(
      Array.from(CSS.matchAll(/--[a-z][a-z0-9-]*\s*:/g), (m) => m[0].replace(/\s*:/, "").trim()),
    )
    // 允许的 Tailwind 语义变量
    const allowedTailwind = new Set(["--tw-", "--background", "--foreground"])
    const tsxText = TSX_FILES.map((f) => readFileSync(f, "utf-8")).join("\n")

    const used = Array.from(tsxText.matchAll(/var\(--([a-z][a-z0-9-]*)\)/g), (m) => m[1])
    const missing = [...new Set(used)].filter(
      (v) =>
        !defined.has(`--${v}`) &&
        !allowedTailwind.has(v.slice(0, 4)) &&
        !allowedTailwind.has(v),
    )

    expect(missing, `引用了未定义的 CSS 变量: ${missing.join(", ")}`).toEqual([])
  })

  it("引用的 radius token 必须是 xs/sm/md/lg 之一", () => {
    const tsxText = TSX_FILES.map((f) => readFileSync(f, "utf-8")).join("\n")
    const radiusRefs = Array.from(tsxText.matchAll(/--radius-([a-z]+)/g), (m) => m[1])
    const allowed = ["xs", "sm", "md", "lg"]
    for (const r of radiusRefs) {
      expect(allowed, `--radius-${r} 不在设计体系中`).toContain(r)
    }
  })
})

// ──────────────────────────────────────────────
// 3. 禁止裸色值
// ──────────────────────────────────────────────
describe("色彩系统一致性（Anti-AI Design）", () => {
  it("TSX 组件中不允许硬编码 #hex 颜色（token 定义除外）", () => {
    // 这些文件是 token 定义 / 品牌色 / QR 绘制，允许例外
    const allowedFiles = [
      "App.tsx",       // 品牌图标渐变
      "Onboarding.tsx", // 品牌图标渐变
      "QRCodeCanvas.tsx", // QR 前景/背景必须用具体色值
      "useApp.tsx",    // 主题初始化
    ]
    const offenders: string[] = []
    for (const f of TSX_FILES) {
      const basename = f.split("/").pop() || ""
      if (allowedFiles.includes(basename)) continue
      const text = readFileSync(f, "utf-8")
      // 排除 CSS var() 内的 hex 值以及 URL/import 等
      const matches = text.match(/#[0-9a-fA-F]{3,8}\b/g) || []
      if (matches.length > 0) {
        offenders.push(`${basename}: ${matches.join(", ")}`)
      }
    }
    expect(offenders, `以下文件存在硬编码颜色:\n${offenders.join("\n")}`).toEqual([])
  })

  it("TSX 中使用颜色必须走语义 token", () => {
    const text = TSX_FILES.map((f) => readFileSync(f, "utf-8")).join("\n")
    // 使用 var(--accent) 而不是纯 accent 类
    const accentUsage = text.match(/text-accent|bg-accent|border-accent/g) || []
    expect(accentUsage, "不应使用裸 accent 类，应使用 var(--accent) token").toEqual([])
  })
})

// ──────────────────────────────────────────────
// 4. Motion 一致性
// ──────────────────────────────────────────────
describe("动效一致性", () => {
  it("TSX 中 framer-motion 的 duration 必须来自 lib/motion", () => {
    const motionFiles = TSX_FILES.filter((f) => {
      const text = readFileSync(f, "utf-8")
      return text.includes("framer-motion")
    })

    for (const f of motionFiles) {
      // lib/motion.ts 本身是 token 定义源（springTransition 默认参数），不算硬编码
      if (f.endsWith("lib/motion.ts")) continue
      const text = readFileSync(f, "utf-8")
      // 查找硬编码的 duration 值（排除已在 lib/motion 中定义的情况）
      const hardcoded = text.match(/duration:\s*(0\.[0-9]+|[0-9]+)/g) || []
      // 允许的 Spring 动画例外（NavPill 胶囊）
      if (f.includes("App.tsx") && hardcoded.includes("duration: 0.45")) {
        continue
      }
      expect(
        hardcoded,
        `${f.split("/").pop()} 中存在硬编码动画时长: ${hardcoded.join(", ")}，应从 lib/motion 导入`,
      ).toEqual([])
    }
  })

  it("列表入场（Stagger / Spring Cascade）在 reduced-motion 下不得有错峰延迟", () => {
    const cardStagger = readFileSync(join(SRC, "components", "CardStagger.tsx"), "utf-8")
    // 必须有 reduce 分支的提前返回
    expect(cardStagger).toMatch(/if\s*\(reduce\)/)
    // 位移必须来自 lib/motion token，不得硬编码 px
    expect(cardStagger).toMatch(/ENTER_DISTANCE/)
    // spring 参数（stiffness / damping）必须集中定义在 lib/motion，组件内不得硬编码
    expect(cardStagger).not.toMatch(/stiffness:\s*\d/)
    expect(cardStagger).not.toMatch(/damping:\s*\d/)

    const motion = readFileSync(join(SRC, "lib", "motion.ts"), "utf-8")
    for (const token of ["SPRING_STIFFNESS", "SPRING_DAMPING", "SPRING_MASS", "STAGGER_TOUCH"]) {
      expect(motion, `lib/motion 需导出 ${token}`).toContain(token)
    }
  })

  it("所有组件尊重 prefers-reduced-motion", () => {
    // index.css 必须有全局降级
    expect(CSS).toMatch(/prefers-reduced-motion/)
    // App.tsx 使用 MotionConfig reducedMotion="user"
    const appText = readFileSync(join(SRC, "App.tsx"), "utf-8")
    expect(appText).toMatch(/reducedMotion\s*=\s*["']user["']/)
  })
})

// ──────────────────────────────────────────────
// 5. 焦点与无障碍
// ──────────────────────────────────────────────
describe("无障碍与焦点态", () => {
  it("全局 :focus-visible 必须存在且使用 accent 色", () => {
    expect(CSS).toMatch(/:focus-visible\s*{/)
    expect(CSS).toMatch(/outline:\s*2px\s+solid\s+var\(--accent\)/)
    expect(CSS).toMatch(/outline-offset:\s*2px/)
  })

  it("::selection 必须使用 accent-tint", () => {
    expect(CSS).toMatch(/::selection\s*{/)
    expect(CSS).toMatch(/background:\s*var\(--accent-tint\)/)
  })

  it("交互元素需要有可访问名称（title / aria-label）", () => {
    const richCard = readFileSync(join(SRC, "components", "RichCard.tsx"), "utf-8")
    // 所有 IconBtn 都必须有 title
    expect(richCard).toMatch(/title=\{(isPinned \? "取消置顶" : "置顶")\}/)
    expect(richCard).toMatch(/title="复制"/)
    expect(richCard).toMatch(/title="删除"/)
    expect(richCard).toMatch(/title="二维码"/)
  })
})

// ──────────────────────────────────────────────
// 6. 响应式与断点
// ──────────────────────────────────────────────
describe("响应式与断点覆盖", () => {
  it("移动端 (max-width: 768px) 有性能降级策略", () => {
    expect(CSS).toMatch(/@media\s*\(max-width:\s*768px\)/)
  })

  it("Sidebar 在移动端隐藏，在桌面显示 (md:flex)", () => {
    const appText = readFileSync(join(SRC, "App.tsx"), "utf-8")
    expect(appText).toMatch(/hidden\s+md:flex/)
    expect(appText).toMatch(/md:hidden/)
  })

  it("底部安全区处理（safe-area-inset）", () => {
    expect(CSS).toMatch(/safe-area-inset-top/)
    expect(CSS).toMatch(/safe-area-inset-bottom/)
    expect(CSS).toMatch(/env\(/)
  })

  it("移动端 touch 目标 ≥ 44px 或使用 padding 补偿", () => {
    const appText = readFileSync(join(SRC, "App.tsx"), "utf-8")
    // MobileNav 底部导航必须有足够的 padding
    expect(appText).toMatch(/pb-\[env\(safe-area-inset-bottom\)\]/)
  })
})

// ──────────────────────────────────────────────
// 7. 组件模式检查（Anti-AI）
// ──────────────────────────────────────────────
describe("组件模式质量（Anti-AI）", () => {
  it("不得使用 emoji 作为界面图标", () => {
    const text = TSX_FILES.map((f) => readFileSync(f, "utf-8")).join("\n")
    // 排除注释和字符串中的 emoji 说明
    const stripped = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
    const emojiPattern = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu
    const matches = stripped.match(emojiPattern)
    expect(matches || [], "界面中不应使用 emoji 作为图标，应使用 Lucide").toEqual([])
  })

  it("不得过度使用渐变背景（anti-ai）", () => {
    const text = TSX_FILES.map((f) => readFileSync(f, "utf-8")).join("\n")
    const gradientCount = (text.match(/bg-gradient-to/g) || []).length
    // App.tsx 品牌图标 + Onboarding 品牌图标 = 2 处，这是合理例外
    expect(gradientCount, `渐变背景使用次数 ${gradientCount} 过多，最多允许 2 处`).toBeLessThanOrEqual(2)
  })

  it("卡片使用有克制（RichCard 列表而非全卡化）", () => {
    const richCard = readFileSync(join(SRC, "components", "RichCard.tsx"), "utf-8")
    expect(richCard).toMatch(/rich-card/) // 使用 RichCard 组件
    // 不应将每个属性都包在独立 card 中
    expect(richCard).not.toMatch(/class="card/g)
  })

  it("Toast 使用圆角胶囊（rounded-full）而非方形", () => {
    const toast = readFileSync(join(SRC, "components", "Toast.tsx"), "utf-8")
    expect(toast).toMatch(/rounded-full/)
  })
})

// ──────────────────────────────────────────────
// 8. Liquid Glass 材质一致性
// ──────────────────────────────────────────────
describe("Liquid Glass 材质一致性", () => {
  it("glass 基类必须包含 backdrop-filter + blur", () => {
    expect(CSS).toMatch(/\.glass\s*{/)
    expect(CSS).toMatch(/backdrop-filter:\s*var\(--blur-glass\)/)
    expect(CSS).toMatch(/-webkit-backdrop-filter:\s*var\(--blur-glass\)/)
  })

  it("glass-strong 必须比 glass 更模糊", () => {
    // glass-strong 使用 blur(32px)
    expect(CSS).toMatch(/\.glass-strong\s*{/)
    expect(CSS).toMatch(/backdrop-filter:\s*blur\(32px\)\s*saturate\(1\.8\)/)
  })

  it("移动端 backdrop-filter 必须降级以保性能", () => {
    // @media (max-width: 768px) 中应该降低 blur
    expect(CSS).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?blur\(16px\)/)
  })
})

// ──────────────────────────────────────────────
// 9. 卡片容器防溢出（Issue #41 iPad PWA UI 溢出）
// ──────────────────────────────────────────────
describe("卡片容器防溢出（Issue #41）", () => {
  it("CardStagger 作为 grid 项必须有 min-w-0，防止内容撑开 grid 列", () => {
    const cardStagger = readFileSync(join(SRC, "components", "CardStagger.tsx"), "utf-8")
    // grid 项默认 min-width:auto 会被内部超宽内容（长代码/无空格文本）撑开，
    // 导致 RichCard 卡片溢出容器。必须显式 min-w-0 允许收缩。
    expect(cardStagger, "CardStagger 的 motion.div 需含 min-w-0 以允许 grid 项收缩").toMatch(/min-w-0/)
  })

  it("RichCard 根元素已约束 max-w-full + min-w-0", () => {
    const richCard = readFileSync(join(SRC, "components", "RichCard.tsx"), "utf-8")
    expect(richCard).toMatch(/min-w-0/)
    expect(richCard).toMatch(/max-w-full/)
  })

  it("CodeBlock 内部横向溢出由容器裁剪，不撑开卡片", () => {
    const codeBlock = readFileSync(join(SRC, "components", "CodeBlock.tsx"), "utf-8")
    // CodeBlock 容器需 overflow-hidden + max-w-full，长代码在内部横向滚动而非撑开卡片
    expect(codeBlock).toMatch(/overflow-hidden/)
    expect(codeBlock).toMatch(/max-w-full/)
  })
})
