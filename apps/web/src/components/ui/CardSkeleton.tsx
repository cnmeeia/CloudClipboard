/**
 * 剪贴板卡片加载骨架。
 */

export function CardSkeleton() {
  return (
    <div className="glass p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="skeleton h-5 w-16 rounded-full" />
        <div className="skeleton h-3 w-12" />
      </div>
      <div className="skeleton h-4 w-full mb-2" />
      <div className="skeleton h-4 w-2/3" />
    </div>
  )
}
