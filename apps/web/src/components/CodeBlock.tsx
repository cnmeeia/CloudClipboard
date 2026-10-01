/**
 * CodeBlock：代码内容高亮展示（§ 推荐组件落地）
 * 适配自 Rare UI 的 Code Block 组件，按项目风格简化：
 * - 轻量语法高亮（基于 token 正则，不引入重型依赖）
 * - 顶栏带语言标签 + 复制按钮
 * - 支持行号开关
 *
 * 仅用于展示层，不做编辑器。保留 RichCard 的剪贴板卡片观感。
 */

import { useEffect, useRef, useState } from "react"
import { Copy, Check, ChevronRight, ChevronDown } from "@/components/ui"
import { useCopy } from "@/hooks/useCopy"

interface Props {
  code: string
  /** 语言标签（json / shell / ts / text…），仅用于展示 */
  lang?: string
  /** 是否显示行号 */
  lineNumbers?: boolean
  /** 最大显示行数，超出折叠（默认 12，传 0 表示全部展开） */
  maxLines?: number
  className?: string
}

const LANG_LABEL: Record<string, string> = {
  json: "JSON",
  shell: "Shell",
  bash: "Bash",
  text: "文本",
  typescript: "TS",
  ts: "TS",
  javascript: "JS",
  js: "JS",
}

/** 轻量关键字高亮：仅用于文本着色，不做语义级解析 */
const TOKEN_RULES: { re: RegExp; cls: string }[] = [
  { re: /("(?:\\"|[^"])*"|'(?:\\'|[^'])*'|`(?:\\`|[^`])*`)/g, cls: "tok-str" },
  { re: /\b(\d+(?:\.\d+)?)\b/g, cls: "tok-num" },
  { re: /\b(true|false|null|undefined)\b/g, cls: "tok-bool" },
  { re: /\b(?:const|let|var|function|return|if|else|for|while|class|import|export|from|new|typeof|async|await|throw|try|catch|switch|case|break|default|def|public|private|static|final|package|using|namespace)\b/g, cls: "tok-kw" },
]

function highlight(code: string): React.ReactNode[] {
  // 逐 token 顺序匹配，避免嵌套/重叠
  const tokens: { text: string; cls: string | null }[] = [{ text: code, cls: null }]
  for (const rule of TOKEN_RULES) {
    let i = 0
    while (i < tokens.length) {
      const t = tokens[i]
      if (t.cls !== null) {
        i++
        continue
      }
      rule.re.lastIndex = 0
      const matches = [...t.text.matchAll(rule.re)]
      if (matches.length === 0) {
        i++
        continue
      }
      const parts: { text: string; cls: string | null }[] = []
      let cursor = 0
      for (const m of matches) {
        if (m.index! > cursor) parts.push({ text: t.text.slice(cursor, m.index), cls: null })
        parts.push({ text: m[0], cls: rule.cls })
        cursor = m.index! + m[0].length
      }
      if (cursor < t.text.length) parts.push({ text: t.text.slice(cursor), cls: null })
      tokens.splice(i, 1, ...parts)
      i += parts.length
    }
  }
  return tokens.map((t, idx) =>
    t.cls ? (
      <span key={idx} className={`${t.cls}`}>
        {t.text}
      </span>
    ) : (
      <span key={idx}>{t.text}</span>
    )
  )
}

export function CodeBlock({
  code,
  lang,
  lineNumbers = true,
  maxLines = 12,
  className = "",
}: Props) {
  const { copied, copy } = useCopy()
  const [wrap, setWrap] = useState(false)
  const lines = code.split("\n")
  const collapsible = maxLines > 0 && lines.length > maxLines
  const [collapsed, setCollapsed] = useState(collapsible)
  const visibleLines = collapsed ? lines.slice(0, maxLines) : lines

  // 检测代码区是否存在横向溢出（长行被滚动隐藏），用于展示“左右滑动”提示
  const preRef = useRef<HTMLPreElement>(null)
  const [canScroll, setCanScroll] = useState(false)

  useEffect(() => {
    const el = preRef.current
    if (!el) return
    const update = () => setCanScroll(el.scrollWidth > el.clientWidth + 4)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    el.addEventListener("scroll", update)
    return () => {
      ro.disconnect()
      el.removeEventListener("scroll", update)
    }
  }, [code, collapsed])

  return (
    <div
      className={`min-w-0 max-w-full overflow-hidden rounded-[var(--radius-sm)] border border-[var(--hairline)] bg-[var(--bg-subtle)] ${className}`}
    >
      {/* 顶栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--hairline)] bg-[var(--bg-subtle)]/60">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
            {lang ? LANG_LABEL[lang] || lang : "代码"}
          </span>
          <button
            onClick={() => setWrap((v) => !v)}
            title="长行自动换行，替代横向滑动"
            aria-label={wrap ? "取消自动换行" : "启用自动换行"}
            className={`shrink-0 px-2 py-1 rounded-[var(--radius-sm)] text-[10px] transition-colors cursor-pointer ${
              wrap
                ? "text-[var(--accent)] bg-[var(--accent-tint)]"
                : "text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--accent-tint)]"
            }`}
          >
            自动换行
          </button>
        </div>
        <button
          onClick={() => copy(code)}
          className="flex items-center gap-1 px-2 py-1 rounded-[var(--radius-sm)] text-[10px] text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--accent-tint)] transition-colors cursor-pointer"
          aria-label="复制代码"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>

      {/* 代码区：默认保留原始格式（whitespace-pre + 横向滚动），
          开启"自动换行"后长行折行显示，适合移动端阅读。 */}
      <pre
        ref={preRef}
        className={`p-3 pb-6 font-mono text-[12px] leading-relaxed max-w-full text-[var(--text-primary)] ${
          wrap ? "whitespace-pre-wrap break-words overflow-x-hidden" : "whitespace-pre overflow-x-auto"
        }`}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <code>
          {visibleLines.map((line, i) => (
            <span key={i} className="block">
              {lineNumbers && (
                <span className="inline-block w-6 select-none text-right mr-3 text-[var(--text-tertiary)]/60">
                  {i + 1}
                </span>
              )}
              {highlight(line)}
            </span>
          ))}
        </code>
      </pre>

      {/* 横向滚动提示：仅未开启自动换行且长行超出可视宽度时提示可左右滑动查看完整内容 */}
      {!wrap && canScroll && (
        <div className="pointer-events-none -mt-5 mb-1 flex items-center justify-center gap-1 text-[10px] text-[var(--text-tertiary)]">
          <ChevronRight className="w-3 h-3 rotate-180" />
          左右滑动查看完整内容
          <ChevronRight className="w-3 h-3" />
        </div>
      )}

      {/* 折叠开关 */}
      {collapsible && (
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="w-full flex items-center justify-center gap-1 py-2 text-[11px] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-subtle)] border-t border-[var(--hairline)] transition-colors cursor-pointer"
        >
          {collapsed ? (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              展开全部 {lines.length} 行
            </>
          ) : (
            <>
              <ChevronRight className="w-3.5 h-3.5" />
              收起
            </>
          )}
        </button>
      )}
    </div>
  )
}
