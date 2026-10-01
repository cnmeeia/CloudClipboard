/**
 * 新版本提示条（Issue #86 后续）
 *
 * 为什么需要它：iOS standalone PWA 从桌面图标打开时没有导航，
 * SW 不会自动检查更新，用户会长期停留在旧 bundle（「改了没生效」）。
 * swUpdate 模块补上了主动检查，但检测到新版本后**不能直接 reload**——
 * 那会在用户正在输入/粘贴时清空内容（观感上就像粘贴行为异常）。
 * 所以这里给一个可操作的提示条，由用户决定何时刷新。
 */

import { useEffect, useState } from "react"
import { RefreshCw } from "@/components/ui"
import { onUpdateReady, applyUpdate } from "@/lib/swUpdateStore"

export function UpdatePrompt() {
  const [ready, setReady] = useState(false)
  const [applying, setApplying] = useState(false)

  useEffect(() => onUpdateReady(() => setReady(true)), [])

  if (!ready) return null

  return (
    <div
      role="status"
      className="fixed left-1/2 -translate-x-1/2 top-3 z-[70] w-[min(92vw,360px)] animate-slide-up"
    >
      <div className="glass flex items-center gap-3 px-3 py-2.5 rounded-xl shadow-lg">
        <RefreshCw className="w-4 h-4 text-[var(--accent)] shrink-0" />
        <span className="flex-1 text-[12px] leading-snug" style={{ color: "var(--text-primary)" }}>
          有新版本可用，刷新后生效
        </span>
        <button
          onClick={() => {
            setApplying(true)
            applyUpdate()
          }}
          disabled={applying}
          className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-[var(--accent)] text-white disabled:opacity-60 cursor-pointer shrink-0"
        >
          {applying ? "刷新中…" : "立即刷新"}
        </button>
      </div>
    </div>
  )
}
