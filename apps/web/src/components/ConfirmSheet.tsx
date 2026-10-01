/**
 * ConfirmSheet：统一的二次确认弹层
 * - placement="center"（默认）：居中悬浮 Modal
 * - placement="bottom"：底部圆角抽屉（删除等危险操作）
 */

import { useEffect } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { EASE_EXPO, DUR_FAST, DUR_SHEET, DUR_MASK, SHEET_DISTANCE } from "@/lib/motion"
import { Trash2, AlertTriangle, Button, Spinner } from "@/components/ui"

export interface ConfirmSheetProps {
  open: boolean
  title?: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  busy?: boolean
  /** 操作失败的内联错误提示 */
  error?: string
  showIcon?: boolean
  placement?: "center" | "bottom"
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmSheet({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "取消",
  danger = true,
  busy = false,
  error,
  showIcon = true,
  placement = "center",
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  const reduce = useReducedMotion()
  const isBottom = placement === "bottom"
  const isCompact = !showIcon && !title

  // Esc 关闭 + 打开时锁定背景滚动
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel()
    }
    window.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onCancel])

  const a11yLabel = title || description

  const content = (
    <>
      {isBottom && showIcon && danger && (
        <div className="flex justify-center mb-3">
          <div className="w-12 h-12 rounded-full bg-[var(--error-tint)] flex items-center justify-center text-[var(--error)]">
            <Trash2 className="w-6 h-6" />
          </div>
        </div>
      )}

      <div className={isBottom ? "text-center" : "text-left"}>
        {title && <h3 className="text-base font-semibold mb-2 text-[var(--text-primary)]">{title}</h3>}
        <p
          className={
            isCompact
              ? "text-base leading-relaxed text-[var(--text-primary)]"
              : "text-sm leading-relaxed text-[var(--text-secondary)]"
          }
        >
          {description}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-1.5 px-3 py-2 rounded-lg text-xs text-[var(--error)] bg-[var(--error-tint)]"
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>{error}</span>
        </div>
      )}

      <div className={isCompact ? "mt-8 flex flex-col gap-3" : "mt-6 flex flex-col gap-2"}>
        <Button
          variant={danger ? "danger" : "primary"}
          onClick={onConfirm}
          isDisabled={busy}
          className="w-full py-3 !text-sm"
        >
          {busy ? (
            <>
              <Spinner size={14} onAccent />
              处理中…
            </>
          ) : (
            confirmLabel
          )}
        </Button>
        <Button variant="secondary" onClick={onCancel} isDisabled={busy} className="w-full py-3 !text-sm">
          {cancelLabel}
        </Button>
      </div>
    </>
  )

  // Portal 到 body：避免父级 transform / backdrop-filter 改变 fixed 包含块。
  // 根层 stopPropagation：阻止合成事件冒泡到卡片 onClick。
  return createPortal(
    <div onClick={(e) => e.stopPropagation()}>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-[var(--z-overlay)] bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onCancel}
              transition={{ duration: DUR_MASK, ease: EASE_EXPO }}
              style={{
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
                overscrollBehavior: "contain",
              }}
            />

            {isBottom ? (
              <div className="fixed inset-x-0 bottom-0 z-[var(--z-overlay)] flex items-end justify-center pointer-events-none">
                <motion.div
                  role="dialog"
                  aria-modal="true"
                  aria-label={a11yLabel}
                  className="pointer-events-auto w-full max-w-lg rounded-t-[var(--radius-md)] bg-[var(--bg-surface-solid)] border border-b-0 border-[var(--hairline-strong)] shadow-lg px-5 pt-3"
                  style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: SHEET_DISTANCE }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: SHEET_DISTANCE }}
                  transition={reduce ? { duration: DUR_FAST } : { type: "spring", duration: DUR_SHEET, bounce: 0.18 }}
                >
                  <div className="mx-auto my-3 h-1 w-10 rounded-full bg-[var(--hairline-strong)]" />
                  {content}
                </motion.div>
              </div>
            ) : (
              <div className="fixed inset-0 z-[var(--z-overlay)] flex items-center justify-center p-4 pointer-events-none">
                <motion.div
                  role="dialog"
                  aria-modal="true"
                  aria-label={a11yLabel}
                  className="pointer-events-auto w-[min(85vw,420px)] rounded-[var(--radius-md)] bg-[var(--bg-surface-solid)] border border-[var(--hairline-strong)] shadow-lg px-5 pt-5 pb-6"
                  style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 6 }}
                  transition={{ duration: DUR_FAST, ease: EASE_EXPO }}
                >
                  {content}
                </motion.div>
              </div>
            )}
          </>
        )}
      </AnimatePresence>
    </div>,
    document.body
  )
}

export default ConfirmSheet
