/**
 * 剪贴板页（§28 Timeline / §45）
 * 搜索、筛选、排序、复制、收藏、删除
 */

import { useEffect, useDeferredValue, useMemo, useState, useRef } from "react"
import { useApp } from "@/hooks/useApp"
import { RichCard } from "@/components/RichCard"
import { PushForm } from "@/components/PushForm"
import { CardStagger } from "@/components/CardStagger"
import { Search, Layers, ArrowUpDown, ChevronDown, ClipboardList, CardSkeleton, EmptyState } from "@/components/ui"
import { searchItems } from "@/lib/content"
import type { ClipboardItem } from "@cloudclipboard/types"
import { CLIPBOARD_LIST_LIMIT } from "@cloudclipboard/shared"

type FilterType = "all" | "text" | "url" | "code" | "image" | "file"
type SortMode = "newest" | "oldest"

export function ClipboardPage() {
  const { items, loading, refreshList, pins } = useApp()
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<FilterType>("all")
  const [sort, setSort] = useState<SortMode>("newest")
  // 搜索输入延迟生效：输入时不阻塞渲染，避免大列表每敲一个字符整页重算
  const deferredQuery = useDeferredValue(query)

  // 下拉刷新（提示词 C）
  const [pullDistance, setPullDistance] = useState(0)
  const [pulling, setPulling] = useState(false)
  const startY = useRef<number | null>(null)
  const pullRef = useRef<HTMLDivElement>(null)

  const onTouchStart = (e: React.TouchEvent) => {
    // 仅当列表已滚到顶部时启用下拉
    const el = pullRef.current
    if (el && el.scrollTop > 0) return
    if (window.scrollY > 0) return
    startY.current = e.touches[0].clientY
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null) return
    const dy = e.touches[0].clientY - startY.current
    if (dy > 0) {
      e.preventDefault()
      setPulling(true)
      setPullDistance(Math.min(72, dy * 0.4))
    }
  }
  const onTouchEnd = () => {
    if (pullDistance >= 48 && pulling) {
      // 超过阈值触发刷新
      refreshList()
    }
    setPullDistance(0)
    setPulling(false)
    startY.current = null
  }

  // 底部主按钮（读取系统剪贴板同步）已移除：iOS PWA 下 readText 权限受限，
  // 统一由 PushForm 的粘贴按钮/输入框粘贴完成，避免重复入口与权限报错。

  useEffect(() => {
    // 已有数据时静默刷新（不切换 loading/同步文案），冷启动才显示骨架
    refreshList({ background: items.length > 0 })
    // 仅在挂载时触发，不依赖 items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshList])

  const filtered = useMemo(() => {
    let list = [...items]
    if (filter !== "all") {
      list = list.filter((i) => i.type === filter)
    }
    if (deferredQuery.trim()) {
      const q = deferredQuery
      list = searchItems(list, q, (i) => `${i.device_name} ${i.filename ?? ""} ${i.type}`)
    }
    if (sort === "oldest") {
      list.sort((a, b) => a.created_at - b.created_at)
    } else {
      list.sort((a, b) => b.created_at - a.created_at)
    }
    return list
  }, [items, deferredQuery, filter, sort])

  const pinnedItems = useMemo(() => {
    const idSet = new Set(pins)
    return filtered.filter((i) => idSet.has(i.id))
  }, [filtered, pins])

  const regularItems = useMemo(() => {
    const idSet = new Set(pins)
    return filtered.filter((i) => !idSet.has(i.id))
  }, [filtered, pins])

  // Timeline 分组（§28）
  const groups = useMemo(() => {
    const result: { label: string; items: ClipboardItem[] }[] = []
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const startOfYesterday = startOfToday - 86400000
    const startOfWeek = startOfToday - now.getDay() * 86400000

    const bucket = (label: string) => {
      const items = regularItems.filter((i) => {
        if (label === "今天") return i.created_at >= startOfToday
        if (label === "昨天") return i.created_at >= startOfYesterday && i.created_at < startOfToday
        if (label === "本周") return i.created_at >= startOfWeek && i.created_at < startOfYesterday
        return i.created_at < startOfWeek
      })
      if (items.length > 0) result.push({ label, items })
    }
    bucket("今天")
    bucket("昨天")
    bucket("本周")
    bucket("更早")
    return result
  }, [regularItems])

  return (
    <div
      ref={pullRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {/* 下拉刷新指示器：未达阈值时旋转暂停（作为下拉图标），达阈值后旋转 */}
      <div
        className="flex items-center justify-center overflow-hidden transition-all"
        style={{ height: pullDistance, opacity: pullDistance > 0 ? 1 : 0 }}
      >
        <span
          className="spinner text-[var(--accent)]"
          style={{
            width: 20,
            height: 20,
            borderWidth: 2,
            borderColor: "var(--accent-tint)",
            borderTopColor: "var(--accent)",
            animationPlayState: pulling && pullDistance >= 48 ? "running" : "paused",
            transform: `rotate(${pullDistance * 3}deg)`,
          }}
        />
      </div>

      <PushForm />

      {/* 搜索 + 筛选（自适应：窄屏自动换行，防溢出屏幕边缘） */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--bg-subtle)] border border-[var(--hairline)] min-w-0 transition-all focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-tint)]">
          <Search className="w-4 h-4 text-[var(--text-tertiary)] shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="搜索剪贴板…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-tertiary)] min-w-0 text-[var(--text-primary)]"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="filter-select flex-1 sm:flex-none min-w-0">
            <span className="filter-select__icon">
              <Layers className="w-3.5 h-3.5" />
            </span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.currentTarget.value as FilterType)}
              aria-label="按类型筛选"
              className="field-select w-full sm:w-auto min-w-0"
            >
              <option value="all">全部类型</option>
              <option value="text">文本</option>
              <option value="url">链接</option>
              <option value="code">代码</option>
              <option value="image">图片</option>
              <option value="file">文件</option>
            </select>
            <span className="filter-select__chevron">
              <ChevronDown className="w-3.5 h-3.5" />
            </span>
          </span>
          <span className="filter-select flex-1 sm:flex-none min-w-0">
            <span className="filter-select__icon">
              <ArrowUpDown className="w-3.5 h-3.5" />
            </span>
            <select
              value={sort}
              onChange={(e) => setSort(e.currentTarget.value as SortMode)}
              aria-label="排序方式"
              className="field-select w-full sm:w-auto min-w-0"
            >
              <option value="newest">最新优先</option>
              <option value="oldest">最早优先</option>
            </select>
            <span className="filter-select__chevron">
              <ChevronDown className="w-3.5 h-3.5" />
            </span>
          </span>
        </div>
      </div>

      {/* 列表范围提示：只展示最新 N 条，更早的记录仍在云端（避免误以为丢失） */}
      {!loading && items.length > 0 && items.length >= CLIPBOARD_LIST_LIMIT && (
        <p className="mb-3 text-[11px] text-[var(--text-tertiary)]">
          仅显示最新 {CLIPBOARD_LIST_LIMIT} 条记录，更早的内容仍保留在云端（未被清理）。
        </p>
      )}

      {/* 加载骨架（§86） */}
      {loading && filtered.length === 0 && (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* 置顶区 */}
      {pinnedItems.length > 0 && (
        <div className="mb-5">
          <h2 className="section-label mb-2 tabular-nums">
            置顶 · {pinnedItems.length}
          </h2>
          <div className="grid gap-3">
            {pinnedItems.map((item, i) => (
              <CardStagger key={item.id} index={i}>
                <RichCard item={item} />
              </CardStagger>
            ))}
          </div>
        </div>
      )}

      {/* Timeline（卡片错峰入场，索引沿页面连续累计，封顶由 CardStagger 控制） */}
      {groups.map((group, gi) => {
        const base =
          (pinnedItems.length > 0 ? pinnedItems.length : 0) +
          groups.slice(0, gi).reduce((n, g) => n + g.items.length, 0)
        return (
          <div key={group.label} className="mb-5">
            <h2 className="section-label mb-2 tabular-nums">
              {group.label} · {group.items.length}
            </h2>
            <div className="grid gap-3">
              {group.items.map((item, i) => (
                <CardStagger key={item.id} index={base + i}>
                  <RichCard item={item} />
                </CardStagger>
              ))}
            </div>
          </div>
        )
      })}

      {/* Empty state（§85） */}
      {!loading && filtered.length === 0 && (
        <div className="glass animate-fade-in">
          <EmptyState
            icon={ClipboardList}
            title={deferredQuery || filter !== "all" ? "没有匹配的结果" : "还没有同步内容"}
            description={
              deferredQuery || filter !== "all"
                ? "试试其他关键词或筛选条件"
                : "在其他设备复制一些内容，它会自动出现在这里。"
            }
          />
        </div>
      )}
    </div>
  )
}
