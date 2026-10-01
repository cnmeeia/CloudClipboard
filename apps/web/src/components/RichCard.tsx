/**
 * RichCard：剪贴板条目卡片
 * 支持 URL / 代码 / Shell / OTP / 颜色 / Emoji / 文本，解密在客户端完成。
 * 内容渲染见 RichCardBody。
 */

import { useState, memo } from "react"
import { useNavigate } from "react-router"
import type { ClipboardItem } from "@cloudclipboard/types"
import { analyzeContent, formatRelativeTime, formatBytes, formatExpiry, TYPE_LABELS } from "@/lib/content"
import { useApp } from "@/hooks/useApp"
import { ApiError } from "@/lib/api"
import { useCopy } from "@/hooks/useCopy"
import { useDecryptedItem } from "@/hooks/useDecryptedItem"
import { Copy, Check, Trash2, Pin, PinOff, QrCode } from "@/components/ui"
import { useToast } from "@/components/Toast"
import { ConfirmSheet } from "@/components/ConfirmSheet"
import { UrlBody, OtpBody, ColorBody, EmojiBody, CodeBody, TextBody } from "./RichCardBody"

const KIND_LABEL: Record<string, string> = {
  url: "链接",
  otp: "验证码",
  color: "颜色",
  shell: "命令",
  code: "代码",
  emoji: "表情",
  text: "文本",
}

export const RichCard = memo(function RichCard({ item }: { item: ClipboardItem }) {
  const { deleteItem, togglePin, pins } = useApp()
  const navigate = useNavigate()
  const showToast = useToast()
  const [showQr, setShowQr] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  const isPinned = pins.includes(item.id)
  const { text: content, state: decryptState } = useDecryptedItem(item)
  const { copied, copy } = useCopy()

  const info = analyzeContent(content)
  const kind = info.kind

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    fn()
  }

  const doCopy = async () => {
    const text = kind === "otp" && info.otp ? info.otp : content
    if (!(await copy(text))) showToast("复制失败，请手动选择文本", "error")
  }

  const doDelete = async () => {
    setDeleteBusy(true)
    setDeleteError("")
    try {
      await deleteItem(item.id)
      setConfirmDelete(false)
    } catch (e) {
      if (e instanceof ApiError && e.code === "NOT_FOUND") {
        setDeleteError("该记录可能已被删除，或当前设备无法解密")
      } else {
        setDeleteError(e instanceof Error ? e.message : "删除失败，请稍后重试")
      }
    } finally {
      setDeleteBusy(false)
    }
  }

  const open = () => navigate(`/clipboard/${item.id}`)
  const typeChip = kind === "code" ? (info.isJson ? "JSON" : "代码") : KIND_LABEL[kind] || TYPE_LABELS[item.type] || "文本"
  // 有效期提示：null = 永久；已过期时 formatExpiry 返回 null（正常情况下列表已过滤）
  const expiryText = formatExpiry(item.expires_at)

  return (
    <div
      className="rich-card glass card-hover p-4 min-w-0 max-w-full cursor-pointer"
      onClick={open}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && open()}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[11px] font-medium text-[var(--text-secondary)] min-w-0 flex-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0" />
            <span className="truncate overflow-hidden text-ellipsis whitespace-nowrap">{item.device_name}</span>
          </span>
          <span className="type-chip shrink-0">{typeChip}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {kind === "url" && (
            <IconBtn onClick={stop(() => setShowQr((v) => !v))} active={showQr} title="二维码">
              <QrCode className="w-4 h-4" />
            </IconBtn>
          )}
          <IconBtn
            onClick={stop(() => togglePin(item.id))}
            active={isPinned}
            title={isPinned ? "取消置顶" : "置顶"}
            label={isPinned ? "取消置顶" : "置顶"}
          >
            {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
          </IconBtn>
          <IconBtn onClick={stop(doCopy)} title="复制" accent label={copied ? "已复制" : "复制"}>
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </IconBtn>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-[20px] min-w-0 max-w-full">
        {decryptState === "loading" ? (
          <div className="skeleton h-4 w-3/4 rounded" />
        ) : decryptState === "nokey" ? (
          <p className="text-xs text-[var(--text-tertiary)]">请先到设置页设置种子短语以解密此条目。</p>
        ) : decryptState === "error" ? (
          <p className="text-xs text-[var(--error)]">解密失败，种子短语可能不匹配。</p>
        ) : kind === "url" ? (
          <UrlBody content={content} info={info} showQr={showQr} />
        ) : kind === "otp" ? (
          <OtpBody content={content} info={info} />
        ) : kind === "color" ? (
          <ColorBody content={content} info={info} onCopy={doCopy} />
        ) : kind === "emoji" ? (
          <EmojiBody content={content} info={info} />
        ) : kind === "code" || kind === "shell" ? (
          <CodeBody content={content} info={info} kind={kind} />
        ) : (
          <TextBody content={content} info={info} expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
        )}
      </div>

      {/* Footer：时间 + 有效期/剩余时间 + 字符统计/大小 + 删除，删除独立为显式操作 */}
      <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-[var(--hairline)]">
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] text-[var(--text-tertiary)] shrink-0">{formatRelativeTime(item.created_at)}</span>
          {/* 有效期可见性：区分「永久保存」与「到期自动销毁」，避免到期无声消失 */}
          {item.expires_at != null ? (
            <span
              className="text-[10px] shrink-0 truncate"
              style={{ color: expiryText ? "var(--text-tertiary)" : "var(--error)" }}
            >
              {expiryText ? `· ${expiryText}销毁` : "· 已过期"}
            </span>
          ) : (
            <span className="text-[10px] text-[var(--text-tertiary)] shrink-0">· 永久</span>
          )}
        </span>
        <span className="flex items-center gap-2 min-w-0 truncate">
          {(kind === "text" || kind === "code" || kind === "shell") && content && (
            <span className="text-[10px] text-[var(--text-tertiary)] font-mono shrink-0">{content.length} 字符</span>
          )}
          {item.size != null && (
            <span className="text-[10px] text-[var(--text-tertiary)] font-mono shrink-0">{formatBytes(item.size)}</span>
          )}
        </span>
        <button
          onClick={stop(() => setConfirmDelete(true))}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-tertiary)] hover:text-[var(--error)] hover:bg-[var(--error-tint)] transition-colors cursor-pointer"
          title="删除"
        >
          <Trash2 className="w-4 h-4" />
          删除
        </button>
      </div>

      <ConfirmSheet
        open={confirmDelete}
        title="删除这条记录？"
        description="删除后无法恢复，且将从所有设备移除。"
        confirmLabel="确认删除"
        danger
        busy={deleteBusy}
        error={deleteError}
        placement="bottom"
        onConfirm={doDelete}
        onCancel={() => {
          if (deleteBusy) return
          setConfirmDelete(false)
          setDeleteError("")
        }}
      />
    </div>
  )
})

function IconBtn({
  children,
  onClick,
  title,
  label,
  active,
  accent,
}: {
  children: React.ReactNode
  onClick: (e: React.MouseEvent) => void
  title?: string
  label?: string
  active?: boolean
  accent?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title || label}
      className={`flex items-center gap-1 px-2 py-2 rounded-xl transition-all cursor-pointer ${
        accent
          ? "text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--accent-tint)]"
          : active
            ? "text-[var(--accent)] bg-[var(--accent-tint)]"
            : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
      }`}
    >
      {children}
      {label && <span className="hidden md:inline text-[11px] font-medium">{label}</span>}
    </button>
  )
}
