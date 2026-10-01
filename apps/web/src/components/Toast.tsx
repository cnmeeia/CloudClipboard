/**
 * Toast 全局反馈（统一显示 · B1）
 *
 * 替代散落在各页面的独立 toast（PushForm / ClipboardPage 读剪贴板提示等）：
 * - 单一宿主：底部居中、玻璃胶囊、统一 2.2s 时长
 * - 支持 info / success / error 三态着色
 * - 栈式展示（最多同时 3 条），自动消失
 * - 动画统一走 motion.ts 常量，尊重 prefers-reduced-motion
 */

import { createContext, useCallback, useContext, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { EASE_OUT, DUR_FAST } from "@/lib/motion"

export type ToastKind = "info" | "success" | "error"

interface ToastItem {
  id: number
  message: string
  kind: ToastKind
}

const TOAST_COLOR: Record<ToastKind, string> = {
  info: "var(--text-primary)",
  success: "var(--success)",
  error: "var(--error)",
}

/** 展示时长（与原有各 toast 一致） */
const TOAST_DURATION_MS = 2200
/** 同时最多展示条数 */
const TOAST_MAX = 3

type ShowToast = (message: string, kind?: ToastKind) => void

const ToastCtx = createContext<ShowToast>(() => {})

export function useToast(): ShowToast {
  return useContext(ToastCtx)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const show = useCallback<ShowToast>((message, kind = "info") => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev.slice(-(TOAST_MAX - 1)), { id, message, kind }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, TOAST_DURATION_MS)
  }, [])

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {/* 全局 Toast 宿主：底部居中，悬浮于移动底栏之上 */}
      <div
        aria-live="polite"
        className="fixed left-1/2 -translate-x-1/2 bottom-24 z-[var(--z-toast)] flex flex-col items-center gap-2 pointer-events-none w-max max-w-[92vw]"
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.96 }}
              transition={{ duration: DUR_FAST, ease: EASE_OUT }}
              className="glass-strong px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-[92vw]"
              style={{ color: TOAST_COLOR[t.kind] }}
            >
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  )
}

export default ToastProvider
