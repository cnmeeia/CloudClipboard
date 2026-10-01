/**
 * RichCard 内容视图：按识别类型渲染 URL / OTP / 颜色 / Emoji / 代码 / 文本。
 */

import { ExternalLink } from "@/components/ui"
import { QRCodeCanvas } from "@/components/QRCodeCanvas"
import { CodeBlock } from "@/components/CodeBlock"
import type { ContentInfo } from "@/lib/content"

interface BodyProps {
  content: string
  info: ContentInfo
}

export function UrlBody({ content, info, showQr }: BodyProps & { showQr: boolean }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {info.faviconUrl && (
          <img
            src={info.faviconUrl}
            alt=""
            className="w-4 h-4 rounded"
            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
          />
        )}
        <div className="min-w-0">
          <div className="text-[11px] text-[var(--text-tertiary)] truncate">{info.domain}</div>
          <a
            href={info.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="min-w-0 text-sm font-medium text-[var(--accent)] hover:underline break-all inline-flex items-center gap-1"
          >
            {content}
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
        </div>
      </div>
      {showQr && (
        <div className="flex flex-col items-center gap-2 p-3 bg-[var(--bg-subtle)] rounded-lg animate-pop-in">
          <QRCodeCanvas value={info.url || content} size={120} />
          <span className="text-[10px] text-[var(--text-tertiary)]">扫码在手机打开</span>
        </div>
      )}
    </div>
  )
}

export function OtpBody({ content, info }: BodyProps) {
  return (
    <div className="space-y-1">
      <div className="text-2xl font-bold tracking-[0.2em] font-mono text-[var(--text-primary)]">
        {info.otp}
      </div>
      {content.trim() !== info.otp && (
        <div className="text-xs text-[var(--text-tertiary)] truncate">{content}</div>
      )}
    </div>
  )
}

export function ColorBody({ info, onCopy }: BodyProps & { onCopy: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="w-10 h-10 rounded-lg border border-[var(--hairline)] cursor-pointer"
        style={{ backgroundColor: info.colorHex }}
        onClick={(e) => {
          e.stopPropagation()
          onCopy()
        }}
        title="点击复制"
      />
      <span className="text-sm font-mono">{info.colorHex}</span>
    </div>
  )
}

export function EmojiBody({ info }: BodyProps) {
  return <div className="text-3xl">{info.emoji}</div>
}

export function CodeBody({ content, info, kind }: BodyProps & { kind: string }) {
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <CodeBlock
        code={info.isJson && info.formattedJson ? info.formattedJson : content || "（无法解密）"}
        lang={info.lang || (kind === "shell" ? "shell" : undefined)}
        maxLines={10}
      />
    </div>
  )
}

export function TextBody({ content, expanded, onToggle }: BodyProps & { expanded: boolean; onToggle: () => void }) {
  const isLong = content.length > 160
  const clamped = isLong && !expanded
  return (
    <div className="min-w-0 max-w-full">
      <pre
        className="font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-words min-w-0 max-w-full text-[var(--text-primary)]"
        style={{
          overflowWrap: "anywhere",
          ...(clamped
            ? {
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 3,
                overflow: "hidden",
              }
            : {}),
        }}
      >
        {content || "（无法解密）"}
      </pre>
      {isLong && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          className="mt-2 flex items-center gap-1 text-[11px] font-medium text-[var(--accent)] hover:underline cursor-pointer"
        >
          {expanded ? "收起" : "展开全文"}
        </button>
      )}
    </div>
  )
}

export type { BodyProps }
