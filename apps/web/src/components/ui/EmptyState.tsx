/**
 * 空状态占位：图标 + 标题 + 可选描述/操作。
 */

import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  children?: ReactNode
}

export function EmptyState({ icon: Icon, title, description, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4">
      <div className="w-12 h-12 rounded-2xl bg-[var(--bg-subtle)] flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-[var(--text-tertiary)]" />
      </div>
      <p className="text-sm font-medium text-[var(--text-secondary)]">{title}</p>
      {description && <p className="text-xs text-[var(--text-tertiary)] mt-1 max-w-xs">{description}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}
