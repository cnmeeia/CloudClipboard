/**
 * 同步指示器（§89）
 * ● Synced / ↻ Syncing / ⚠ Sync failed / ○ Offline / 🔒 Session expired
 */

import { useEffect, useState } from "react"
import { useApp } from "@/hooks/useApp"
import { Cloud, CloudOff, RefreshCw, AlertTriangle, Shield } from "@/components/ui"

type SyncState = "synced" | "syncing" | "failed" | "offline" | "session"

export function SyncIndicator() {
  const { isConfigured, loading, syncing, syncFailed, refreshList, sessionExpired } = useApp()
  const [state, setState] = useState<SyncState>("synced")
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true)
      setState("syncing")
      refreshList()
    }
    const handleOffline = () => {
      setOnline(false)
      setState("offline")
    }
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [refreshList])

  // 会话过期优先于在线/同步状态，独立展示（与离线区分）
  useEffect(() => {
    if (sessionExpired) {
      setState("session")
    } else if (loading) {
      // 仅首屏/手动刷新切换文案；后台轮询不改变当前文案，避免周期性闪烁
      setState("syncing")
    } else if (!online) {
      setState("offline")
    } else if (syncFailed) {
      setState("failed")
    } else {
      setState("synced")
    }
  }, [sessionExpired, loading, online, syncFailed])

  if (!isConfigured) return null

  const config: Record<SyncState, { label: string; icon: React.ReactNode; color: string }> = {
    synced: { label: "已同步", icon: <Cloud className="w-3 h-3" />, color: "var(--success)" },
    syncing: { label: "同步中", icon: <RefreshCw className="w-3 h-3 animate-spin" />, color: "var(--accent)" },
    failed: { label: "同步失败，点击重试", icon: <AlertTriangle className="w-3 h-3" />, color: "var(--error)" },
    offline: { label: "离线", icon: <CloudOff className="w-3 h-3" />, color: "var(--text-tertiary)" },
    session: { label: "登录已过期", icon: <Shield className="w-3 h-3" />, color: "var(--error)" },
  }

  const c = config[state]
  const canRetry = state === "failed"
  // 后台静默轮询中：不切文案，仅在「已同步」态把云图标换成旋转箭头
  const backgroundActive = syncing && state === "synced"
  const shownIcon = backgroundActive ? <RefreshCw className="w-3 h-3 animate-spin" /> : c.icon

  const content = (
    <>
      {shownIcon}
      {c.label}
    </>
  )

  return canRetry ? (
    <button
      type="button"
      onClick={() => refreshList()}
      title="网络异常，点击重新同步"
      className="flex items-center gap-1 text-[11px] font-medium px-2.5 min-h-[28px] rounded-full bg-[var(--bg-subtle)] border border-[var(--hairline)] shrink-0 whitespace-nowrap cursor-pointer transition-colors hover:border-[var(--error)]"
      style={{ color: c.color }}
    >
      {content}
    </button>
  ) : (
    <span
      aria-live="polite"
      className="flex items-center gap-1 text-[10px] font-medium px-2 py-2 rounded-full bg-[var(--bg-subtle)] border border-[var(--hairline)] shrink-0 whitespace-nowrap"
      style={{ color: c.color }}
    >
      {content}
    </span>
  )
}
