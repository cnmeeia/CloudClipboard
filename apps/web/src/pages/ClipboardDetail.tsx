/**
 * 剪贴板详情页（§14 通知点击 → /clipboard/:id）
 */

import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router"
import type { LucideIcon } from "lucide-react"
import type { ClipboardItem } from "@cloudclipboard/types"
import { useApp } from "@/hooks/useApp"
import { useDecryptedItem } from "@/hooks/useDecryptedItem"
import { RichCard } from "@/components/RichCard"
import {
  Button,
  ArrowLeft,
  AlertTriangle,
  Smartphone,
  Tag,
  Clock,
  HardDrive,
  FileText,
  FileClock,
  ExternalLink,
} from "@/components/ui"
import { formatRelativeTime, formatBytes, analyzeContent, TYPE_LABELS } from "@/lib/content"

export function ClipboardDetail() {
  const { id } = useParams<{ id: string }>()
  const { api, items } = useApp()
  const navigate = useNavigate()
  const [item, setItem] = useState<ClipboardItem | undefined>(
    () => items.find((i) => i.id === id),
  )
  const [loading, setLoading] = useState(!item)
  const [error, setError] = useState("")

  // 列表轮询回来的同 id 缓存直接更新到详情，不触发 loading（避免每 30s 闪骨架）
  const cachedById = id ? items.find((i) => i.id === id) : undefined
  useEffect(() => {
    if (cachedById) setItem(cachedById)
  }, [cachedById])

  // 仅在 id 变化（切换记录）时决定走缓存还是拉取；不依赖整个 items 数组
  useEffect(() => {
    if (!id) return
    const cached = items.find((i) => i.id === id)
    if (cached) {
      setItem(cached)
      setLoading(false)
      setError("")
      return
    }
    setLoading(true)
    setError("")
    let cancelled = false
    api
      .fetchClipboardItem(id)
      .then((data) => {
        if (!cancelled) {
          setItem(data)
          setLoading(false)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setLoading(false)
          setError(e instanceof Error ? e.message : "加载失败")
        }
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, api])

  if (loading) {
    return (
      <div className="max-w-2xl">
        <div className="glass p-4 space-y-3">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton h-6 w-3/4" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-1/2" />
        </div>
        <div className="glass mt-4 p-4 space-y-3">
          <div className="skeleton h-4 w-28" />
          <div className="skeleton h-4 w-2/3" />
          <div className="skeleton h-4 w-1/2" />
        </div>
      </div>
    )
  }

  if (error || !item) {
    return (
      <div className="glass p-10 text-center animate-fade-in">
        <div className="mx-auto w-12 h-12 rounded-[var(--radius-md)] bg-[var(--error-tint)] flex items-center justify-center mb-4">
          <AlertTriangle className="w-5 h-5 text-[var(--error)]" />
        </div>
        <h3 className="text-sm font-semibold mb-2 text-[var(--text-primary)]">
          {error || "记录不存在"}
        </h3>
        <p className="text-xs text-[var(--text-tertiary)] mb-4">
          该记录可能已被删除，或当前设备无法解密。
        </p>
        <Button variant="ghost" onClick={() => navigate("/clipboard")}>
          返回剪贴板
        </Button>
      </div>
    )
  }

  return <DetailBody item={item} onBack={() => navigate("/clipboard")} />
}

function DetailBody({ item, onBack }: { item: ClipboardItem; onBack: () => void }) {
  const { text, state } = useDecryptedItem(item)
  const resolved = { ...item, content: text || item.content }
  const info = analyzeContent(text)

  // 详细信息字段：图标 + 标签 + 值，按可读性排列（短值优先，长值可换行）
  const meta: { icon: LucideIcon; label: string; value: string; mono?: boolean }[] = [
    { icon: Smartphone, label: "来源设备", value: item.device_name },
    { icon: Tag, label: "类型", value: TYPE_LABELS[item.type] ?? item.type },
    { icon: Clock, label: "创建时间", value: formatRelativeTime(item.created_at) },
  ]
  if (item.size != null) {
    meta.push({ icon: HardDrive, label: "大小", value: formatBytes(item.size), mono: true })
  }
  if (item.filename) {
    meta.push({ icon: FileText, label: "文件名", value: item.filename, mono: true })
  }
  if (item.expires_at) {
    meta.push({ icon: FileClock, label: "过期时间", value: new Date(item.expires_at).toLocaleString() })
  }

  return (
    <div className="max-w-2xl">
      <Button variant="ghost" size="sm" className="mb-4 -ml-2" onClick={onBack}>
        <ArrowLeft className="w-3.5 h-3.5" />
        返回剪贴板
      </Button>

      <RichCard item={resolved} />

      <section className="glass mt-4 overflow-hidden animate-fade-in">
        <header className="flex items-center gap-2 px-4 pt-4 pb-3">
          <h2 className="text-[13px] font-semibold tracking-tight text-[var(--text-primary)]">
            详细信息
          </h2>
        </header>
        <dl className="px-2 pb-2">
          {meta.map((field, i) => (
            <div
              key={field.label}
              className={`flex items-start gap-3 px-2 py-2.5 rounded-[var(--radius-xs)] ${
                i + 1 < meta.length ? "border-b border-[var(--hairline)]" : ""
              }`}
            >
              <span className="mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--bg-subtle)] text-[var(--text-tertiary)]">
                <field.icon className="w-3.5 h-3.5" />
              </span>
              <dt className="w-20 shrink-0 pt-1 text-xs leading-5 text-[var(--text-tertiary)]">
                {field.label}
              </dt>
              <dd
                className={`min-w-0 flex-1 break-words pt-0.5 text-right text-[13px] leading-5 font-medium text-[var(--text-primary)] ${
                  field.mono ? "font-mono text-xs" : ""
                }`}
              >
                {field.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {state === "ready" && info.kind === "url" && text && (
        <div className="mt-4">
          <Button onClick={() => window.open(text, "_blank", "noopener")}>
            <ExternalLink className="w-3.5 h-3.5" />
            在浏览器打开
          </Button>
        </div>
      )}
    </div>
  )
}
