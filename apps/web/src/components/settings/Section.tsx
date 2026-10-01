/**
 * 设置页通用区块容器：标题栏 + 内容。
 */

import type { ReactNode } from "react"

export function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="glass overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--hairline)]">
        <span className="text-[var(--text-tertiary)]">{icon}</span>
        <h2 className="section-label">{title}</h2>
      </div>
      {children}
    </div>
  )
}
