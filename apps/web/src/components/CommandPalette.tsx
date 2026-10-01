/**
 * 命令面板（§50）
 * ⌘K：搜索 / 推送 / 指令（/clear / /logout / /settings）
 *
 * V2 设计优化：
 * - 移除 emoji，全部改用 Lucide 图标（符合 web-design 规范）
 * - 改进行/间距与视觉层级
 * - 统一按 icon 渲染逻辑
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { useApp } from "@/hooks/useApp"
import {
  Search,
  CornerDownLeft,
  Command,
  Trash2,
  Settings,
  Smartphone,
  Bell,
  Palette,
  ArrowUpRight,
  Pin,
  FileText,
  ClipboardList,
} from "@/components/ui"
import { analyzeContent, toClipboardType, TYPE_LABELS, searchItems } from "@/lib/content"
import { useToast } from "@/components/Toast"
import { ConfirmSheet } from "@/components/ConfirmSheet"

type ShortcutAction = {
  name: string
  label: string
  desc: string
  icon: React.ReactNode
  action: () => void
}

export function CommandPalette() {
  const { items, pushClipboard, deleteItem, pins } = useApp()
  const navigate = useNavigate()
  const showToast = useToast()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = () => {
      setOpen((v) => !v)
      setQuery("")
      setActive(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
    document.addEventListener("cloudclip:palette", handler)
    return () => document.removeEventListener("cloudclip:palette", handler)
  }, [])

  // 打开时锁定背景滚动
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const shortcut = useMemo<ShortcutAction | null>(() => {
    const q = query.trim().toLowerCase()
    if (q === "/clear") {
      return {
        name: "/clear",
        label: "清空当前记录",
        desc: items.length ? `删除本机已加载的 ${items.length} 条剪贴板（不可恢复，需二次确认）` : "当前没有可删除的记录",
        icon: <Trash2 className="w-3.5 h-3.5" />,
        action: () => {
          // 不直接删除：先关闭面板、弹出二次确认（危险且不可恢复）
          if (items.length === 0) return
          setOpen(false)
          setQuery("")
          setConfirmClear(true)
        },
      }
    }
    if (q === "/settings") {
      return { name: "/settings", label: "打开设置", desc: "配置 API 地址与偏好", icon: <Settings className="w-3.5 h-3.5" />, action: () => navigate("/settings") }
    }
    if (q === "/devices") {
      return { name: "/devices", label: "设备管理", desc: "查看当前账户设备", icon: <Smartphone className="w-3.5 h-3.5" />, action: () => navigate("/devices") }
    }
    if (q === "/notifications") {
      return { name: "/notifications", label: "通知设置", desc: "Bark 推送与通知偏好", icon: <Bell className="w-3.5 h-3.5" />, action: () => navigate("/notifications") }
    }
    if (q === "/theme") {
      return { name: "/theme", label: "切换主题", desc: "打开外观设置", icon: <Palette className="w-3.5 h-3.5" />, action: () => navigate("/settings") }
    }
    return null
  }, [query, items, deleteItem, navigate])

  const pushItem = useMemo(() => {
    const q = query.trim()
    if (!q || q.startsWith("/")) return null
    const info = analyzeContent(q)
    return { q, type: toClipboardType(info) }
  }, [query])

  const results = useMemo(() => {
    const q = query.trim()
    if (!q || q.startsWith("/")) return []
    return searchItems(items, q, (i) => `${i.device_name} ${i.filename ?? ""} ${i.type}`).slice(0, 8)
  }, [query, items])

  const totalCount = results.length + (pushItem ? 1 : 0) + (shortcut ? 1 : 0)

  const close = () => {
    setOpen(false)
    setQuery("")
  }

  // 执行清空：逐条删除并统计成功/失败，结束后用 toast 如实汇报
  const runClear = async () => {
    const ids = items.map((i) => i.id)
    if (ids.length === 0) {
      setConfirmClear(false)
      return
    }
    setClearing(true)
    const results = await Promise.allSettled(ids.map((id) => deleteItem(id)))
    setClearing(false)
    setConfirmClear(false)
    const failed = results.filter((r) => r.status === "rejected").length
    const ok = ids.length - failed
    if (failed === 0) {
      showToast(`已删除 ${ok} 条剪贴板`, "success")
    } else if (ok === 0) {
      showToast("删除失败，请检查网络后重试", "error")
    } else {
      showToast(`已删除 ${ok} 条，${failed} 条失败`, "error")
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((a) => (a + 1) % Math.max(totalCount, 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((a) => (a - 1 + totalCount) % Math.max(totalCount, 1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const idx = active
      if (shortcut && idx === 0) {
        shortcut.action()
        close()
      } else if (pushItem && idx === (shortcut ? 1 : 0)) {
        pushClipboard(pushItem.q, pushItem.type)
        close()
      } else {
        const realIdx = idx - (shortcut ? 1 : 0) - (pushItem ? 1 : 0)
        const item = results[realIdx]
        if (item) navigate(`/clipboard/${item.id}`)
        close()
      }
    } else if (e.key === "Escape") {
      close()
    }
  }

  const isActive = (i: number) => active === i

  return (
    <>
      <ConfirmSheet
        open={confirmClear}
        title={`清空 ${items.length} 条剪贴板？`}
        description="将逐条删除当前已加载的剪贴板记录，此操作不可恢复，并会同步到你的所有设备。更早的历史记录不在本次范围内。"
        confirmLabel="全部删除"
        cancelLabel="取消"
        danger
        busy={clearing}
        placement="bottom"
        onConfirm={runClear}
        onCancel={() => setConfirmClear(false)}
      />

      {!open ? null : (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-start justify-center pt-[8vh] p-4 bg-black/15 backdrop-blur-sm animate-fade-in"
      style={{ overscrollBehavior: "contain" }}
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="命令面板"
    >
      <div className="glass-strong w-full max-w-lg overflow-hidden rounded-[var(--radius-lg)] animate-pop-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-[var(--hairline)]">
          <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-[var(--bg-subtle)] border border-[var(--hairline)] flex items-center justify-center text-[var(--text-tertiary)] shrink-0">
            <Search className="w-4 h-4" />
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.currentTarget.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="搜索、推送或输入指令…"
            aria-label="搜索、推送或输入指令"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 bg-transparent text-[16px] outline-none text-[var(--text-primary)]"
          />
          <kbd className="rounded-[var(--radius-sm)] px-2 py-1 font-mono text-[10px] text-[var(--text-tertiary)] border border-[var(--hairline-strong)] bg-[var(--bg-subtle)] shrink-0">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[52vh] overflow-y-auto p-2">
          {shortcut && (
            <PaletteRow active={isActive(0)} icon={shortcut.icon} title={shortcut.label} desc={shortcut.desc} onClick={() => { shortcut.action(); close() }} onHover={() => setActive(0)} />
          )}
          {pushItem && (
            <PaletteRow
              active={isActive(shortcut ? 1 : 0)}
              icon={<ArrowUpRight className="w-3.5 h-3.5" />}
              title={pushItem.q}
              desc={`推送到云端 · ${pushItem.type}`}
              onClick={() => { pushClipboard(pushItem.q, pushItem.type); close() }}
              onHover={() => setActive(shortcut ? 1 : 0)}
              mono
            />
          )}
          {results.map((item, i) => {
            const idx = i + (shortcut ? 1 : 0) + (pushItem ? 1 : 0)
            const isPinned = pins.includes(item.id)
            return (
              <PaletteRow
                key={item.id}
                active={isActive(idx)}
                icon={isPinned ? <Pin className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                title={item.filename || TYPE_LABELS[item.type] || item.type}
                desc={`${item.device_name} · ${new Date(item.created_at).toLocaleString()}`}
                onClick={() => { navigate(`/clipboard/${item.id}`); close() }}
                onHover={() => setActive(idx)}
              />
            )
          })}
          {totalCount === 0 && (
            <div className="py-12 text-center">
              <div className="mx-auto w-10 h-10 rounded-xl bg-[var(--bg-subtle)] border border-[var(--hairline)] flex items-center justify-center mb-3">
                <ClipboardList className="w-4 h-4 text-[var(--text-tertiary)]" />
              </div>
              <p className="text-xs text-[var(--text-tertiary)]">
                输入内容回车推送 · <span className="font-mono">/</span> 查看快捷指令
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--hairline)] text-[10px] text-[var(--text-tertiary)]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><kbd className="font-mono">↑↓</kbd> 选择</span>
            <span className="flex items-center gap-1"><kbd className="font-mono">↵</kbd> 执行</span>
            <span className="flex items-center gap-1"><kbd className="font-mono">/</kbd> 指令</span>
          </div>
          <span className="flex items-center gap-2 font-mono">
            <Command className="w-3 h-3" />
            CloudClipboard
          </span>
        </div>
      </div>
    </div>
      )}
    </>
  )
}

function PaletteRow({
  active,
  icon,
  title,
  desc,
  onClick,
  onHover,
  mono,
}: {
  active: boolean
  icon: React.ReactNode
  title: string
  desc: string
  onClick: () => void
  onHover: () => void
  mono?: boolean
}) {
  return (
    <button
      onMouseEnter={onHover}
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-md)] text-left transition-colors cursor-pointer border-none ${
        active ? "bg-[var(--accent-tint)]" : "bg-transparent"
      }`}
    >
      <span
        className={`w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center shrink-0 transition-colors border ${
          active
            ? "bg-[var(--accent-tint)] border-[var(--accent-border)] text-[var(--accent)]"
            : "bg-[var(--bg-subtle)] border-[var(--hairline)] text-[var(--text-secondary)]"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block text-[13px] truncate ${mono ? "font-mono" : ""} ${
            active ? "text-[var(--accent)] font-semibold" : "text-[var(--text-primary)] font-medium"
          }`}
        >
          {title}
        </span>
        <span className="block text-[11px] text-[var(--text-tertiary)] truncate mt-1">{desc}</span>
      </span>
      <CornerDownLeft className="w-3.5 h-3.5 text-[var(--text-tertiary)] shrink-0" />
    </button>
  )
}
