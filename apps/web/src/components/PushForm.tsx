/**
 * PushForm：输入/粘贴要同步的内容
 * 支持粘贴、类型自动识别、⌘↵ 发送
 */

import { useState, useRef } from "react"
import { useApp } from "@/hooks/useApp"
import { useToast } from "@/components/Toast"
import { analyzeContent, toClipboardType, insertAtSelection, collapseDuplicatePaste } from "@/lib/content"
import type { ClipboardItem } from "@cloudclipboard/types"
import { Button, Spinner, ClipboardPaste, Send } from "@/components/ui"
import { TTLPicker, type TTLValue, TTL_OPTIONS } from "@/components/TTLPicker"
import { isPointerCoarse } from "@/lib/utils"

type ClipboardType = ClipboardItem["type"]

const TYPES: { value: ClipboardType; label: string }[] = [
  { value: "text", label: "文本" },
  { value: "url", label: "链接" },
  { value: "code", label: "代码" },
]

export function PushForm() {
  const { isConfigured, pushClipboard } = useApp()
  const showToast = useToast()
  const [content, setContent] = useState("")
  const [type, setType] = useState<ClipboardType>("text")
  const [busy, setBusy] = useState(false)
  // 有效期必须显式选择：null = 尚未选择 → 禁止提交（Issue #83）
  const [ttl, setTtl] = useState<TTLValue | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isMobile = useRef(isPointerCoarse()).current

  const detect = (text: string) => setType(toClipboardType(analyzeContent(text)))

  const applyClipboardText = (text: string) => {
    setContent(text)
    detect(text)
  }

  // 点「粘贴」：优先用异步剪贴板 API；在 iOS PWA / 未授权等场景 readText 会被拒，
  // 此时聚焦输入框并提示用户长按/用系统粘贴。
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        applyClipboardText(text)
        showToast("已读取本机剪贴板")
        return
      }
      showToast("剪贴板为空，请直接在输入框长按粘贴", "error")
    } catch {
      textareaRef.current?.focus()
      showToast("请在输入框中长按 → 粘贴", "error")
    }
  }

  const submit = async () => {
    // 仅用 trim 做空内容校验；上传仍用原始 content，保证首尾换行/空格原样保留
    if (!content.trim() || !isConfigured || busy) return
    // 未选择有效期 → 明确提示，不做隐式默认（避免「界面是永久、服务端却过期删除」）
    if (!ttl) {
      showToast("请先选择有效期（永久 / 30 分钟 / 1 小时 / 1 天 / 7 天）", "error")
      return
    }
    setBusy(true)
    try {
      const ok = await pushClipboard(content, type, ttl.seconds ?? undefined)
      if (ok) {
        setContent("")
        showToast(ttl.seconds === null ? "已同步到云端，永久保存" : `已同步到云端，${ttl.label}后自动销毁`, "success")
      }
    } catch (e) {
      if (e instanceof Error && e.message === "NO_MASTER_KEY") {
        showToast("请先到设置页设置种子短语", "error")
      } else {
        showToast(e instanceof Error ? e.message : "同步失败", "error")
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="glass p-4 mb-5 animate-slide-up">
      <div className="flex items-center justify-between gap-2 mb-3 overflow-x-auto">
        <div className="flex items-center gap-1 flex-nowrap overflow-x-auto whitespace-nowrap min-w-0">
          {TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setType(t.value)}
              aria-pressed={type === t.value}
              className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 flex items-center gap-1 transition-all cursor-pointer ${
                type === t.value
                  ? "bg-[var(--accent)] text-[var(--on-accent)] shadow-sm"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={handlePaste}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 text-[var(--accent)] hover:bg-[var(--accent-tint)] transition-all cursor-pointer"
          aria-label="读取剪贴板"
        >
          <ClipboardPaste className="w-3.5 h-3.5 shrink-0" />
          <span className="whitespace-nowrap">粘贴</span>
        </button>
      </div>

      <div className="rounded-xl bg-[var(--bg-subtle)] border border-[var(--hairline)] transition-all focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-tint)]">
        <textarea
          ref={textareaRef}
          rows={3}
          value={content}
          onChange={(e) => {
            setContent(e.currentTarget.value)
            detect(e.currentTarget.value)
          }}
          onPaste={(e) => {
            // 手动粘贴兜底：不依赖异步剪贴板权限，直接从粘贴事件取文本。
            //
            // Bug 修复（Issue #86「双重粘贴直接两次」）：
            // 原实现只取剪贴板文本 setContent(text)，但没有 preventDefault()，
            // 浏览器的默认粘贴行为仍会把同一段文本插入 textarea，导致内容被追加两次。
            // 这里改为显式接管插入：阻止默认行为 → 若有选区则替换选区 → 否则在光标处插入，
            // 保证受控 value 与光标位置一致，一次粘贴只出现一次。
            const text = e.clipboardData.getData("text")
            if (!text) return
            e.preventDefault()
            const el = e.currentTarget
            // 兜底：个别 WebKit/PWA 版本会先执行默认插入再把 paste 交给 JS，
            // 此时 el.value 里已经是两份内容（32+32），再插一次会变成三份。
            // 用「粘贴前的受控值 content」作为基线判断是否为引擎重复插入：
            // content 仍为空 → 说明这段内容是引擎塞进 DOM 的，不是用户输入。
            const deduped = collapseDuplicatePaste(content, el.value, text)
            if (deduped !== el.value) {
              setContent(deduped)
              detect(deduped)
              return
            }
            const { value: inserted, caret } = insertAtSelection(
              el.value,
              text,
              el.selectionStart,
              el.selectionEnd
            )
            const next = collapseDuplicatePaste(content, inserted, text)
            const finalCaret = next === inserted ? caret : text.length
            setContent(next)
            detect(next)
            // 光标移动到插入内容之后（等 React 提交新值后再设置，避免被重置到末尾）
            requestAnimationFrame(() => {
              const node = textareaRef.current
              if (!node) return
              node.setSelectionRange(finalCaret, finalCaret)
            })
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={isMobile ? "输入或粘贴要跨设备同步的内容…" : "输入或粘贴要跨设备同步的内容… ⌘↵ 发送"}
          className="w-full bg-transparent text-[14px] resize-none placeholder:text-[var(--text-tertiary)] leading-relaxed p-3 min-h-[72px] text-[var(--text-primary)]"
        />
      </div>

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
          {content.length > 0 && <span className="tabular-nums">{content.length} 字符</span>}
        </div>
        <Button
          onClick={submit}
          isDisabled={busy || !content.trim() || !isConfigured || !ttl}
          size="sm"
        >
          {busy ? (
            <>
              <Spinner size={14} onAccent />
              同步中
            </>
          ) : (
            <>
              同步 <Send className="w-3.5 h-3.5" />
            </>
          )}
        </Button>
      </div>

      {/* 有效期：必须显式选择后才可同步（避免界面显示永久、服务端却按 7 天删除） */}
      <div className="mt-3 pt-3 border-t border-[var(--hairline)] flex flex-wrap items-center justify-between gap-2">
        <TTLPicker value={ttl} selected={ttl !== null} onChange={setTtl} />
        {ttl === null ? (
          <span className="text-[10px] text-[var(--error)]">请先选择有效期再同步</span>
        ) : ttl.seconds === null ? (
          <span className="text-[10px] text-[var(--text-tertiary)]">
            「永久」= 服务端不设过期时间，不会被自动清理
          </span>
        ) : (
          <span className="text-[10px] text-[var(--text-tertiary)]">
            该条将在 <span className="text-[var(--accent)]">{ttl.label}</span> 后自动销毁
          </span>
        )}
      </div>
    </div>
  )
}
