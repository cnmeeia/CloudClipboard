/**
 * DeviceCard（设备页卡片 · 提示词 A）
 *
 * 现代卡片化信息架构：
 * - 左：平台图标（iPhone/iPad/Mac/Windows/Android/Browser，无数据则通用图标）
 * - 中：设备名 + 副行（浏览器 · 平台 · 最后活跃相对时间）
 * - 右上：本机标签 / 在线绿点 / 离线灰点
 * - 操作：重命名、Bark、撤销（始终内联显示，桌面 / 触摸一致 = "same as desktop"）
 *
 * V2 设计优化：
 * - 更好的视觉层级：设备名更突出，元信息更紧凑
 * - 操作按钮更小、更精致
 */

import { Pencil, Trash2, Bell, Laptop, Smartphone, Tablet, Monitor, Cpu, Globe, Button } from "@/components/ui"
import { formatRelativeTime } from "@/lib/content"
import type { Device } from "@cloudclipboard/types"

/** 平台图标（B2：用 Lucide 替换 emoji，避免不同系统渲染不一致） */
const PLATFORM_ICON: Record<string, React.ReactNode> = {
  mac: <Laptop className="w-5 h-5" />,
  ios: <Smartphone className="w-5 h-5" />,
  ipad: <Tablet className="w-5 h-5" />,
  android: <Smartphone className="w-5 h-5" />,
  windows: <Monitor className="w-5 h-5" />,
  linux: <Cpu className="w-5 h-5" />,
  web: <Globe className="w-5 h-5" />,
}

const PLATFORM_LABEL: Record<string, string> = {
  mac: "Mac",
  ios: "iPhone",
  ipad: "iPad",
  android: "Android",
  windows: "Windows",
  linux: "Linux",
  web: "Web",
}

export type DeviceCardProps = {
  device: Device
  isCurrent: boolean
  onRename: (d: Device) => void
  onRevoke: (d: Device) => void
}

export function DeviceCard({
  device: d,
  isCurrent,
  onRename,
  onRevoke,
}: DeviceCardProps) {
  const isOnline = d.status === "offline" || d.status === "revoked" ? false : d.online
  const statusLabel =
    d.status === "revoked" ? "已撤销" : d.status === "offline" ? "离线" : isOnline ? "在线" : "待确认"
  const statusTone =
    d.status === "revoked"
      ? "text-[var(--error)]"
      : isOnline
        ? "text-[var(--success)]"
        : "text-[var(--text-tertiary)]"

  const platformIcon = PLATFORM_ICON[d.platform] || <Globe className="w-5 h-5" />
  const platformLabel = PLATFORM_LABEL[d.platform] || d.platform

  return (
    <div
      className={`glass card-hover p-4 flex items-center gap-3 ${
        isCurrent ? "ring-1 ring-[var(--hairline-strong)]" : ""
      }`}
    >
      {/* 平台图标 */}
      <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--bg-subtle)] border border-[var(--hairline)] flex items-center justify-center shrink-0 text-[var(--text-secondary)]">
        {platformIcon}
      </div>

      {/* 中部信息 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="text-sm font-semibold truncate min-w-0 text-[var(--text-primary)]">
            {d.name}
          </span>
          {isCurrent && (
            <span className="text-[10px] px-2 py-1 rounded-full bg-[var(--accent-tint)] text-[var(--accent)] shrink-0 whitespace-nowrap">
              本机
            </span>
          )}
          <span className={`type-chip font-medium shrink-0 whitespace-nowrap ${statusTone}`}>
            {statusLabel}
          </span>
        </div>
        <div className="text-[11px] mt-1 flex items-center gap-2 text-[var(--text-secondary)] min-w-0 flex-wrap">
          <span className="shrink-0">{platformLabel}</span>
          <span className="shrink-0">·</span>
          <span className="shrink-0">最近活跃：{formatRelativeTime(d.last_seen)}</span>
          {d.browser && (
            <>
              <span className="shrink-0">·</span>
              <span className="truncate min-w-0 max-w-[120px]" title={d.browser}>
                {d.browser}
              </span>
            </>
          )}
        </div>
      </div>

      {/* 状态点 + 操作（始终内联，桌面/触摸一致 = "same as desktop"） */}
      <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
        {/* 在线/离线状态点（在线时呼吸光圈，C4） */}
        <span
          className={`w-2 h-2 rounded-full shrink-0 mr-1 ${isOnline ? "dot-pulse" : ""}`}
          style={{ background: isOnline ? "var(--success)" : "var(--text-tertiary)" }}
          title={isOnline ? "在线" : "离线"}
        />
        <Button variant="ghost" size="sm" onClick={() => onRename(d)} aria-label={`重命名设备 ${d.name}`}>
          <Pencil className="w-3 h-3 shrink-0" />
          <span className="hidden sm:inline">重命名</span>
        </Button>
        {d.bark_url ? (
          <span
            className="flex items-center gap-1 px-2 py-2 rounded-[var(--radius-sm)] text-xs font-medium text-[var(--accent)] whitespace-nowrap"
            title="已配置 Bark 推送"
          >
            <Bell className="w-3 h-3 shrink-0" />
            <span className="hidden sm:inline">Bark</span>
          </span>
        ) : null}
        <Button variant="danger" size="sm" onClick={() => onRevoke(d)} aria-label={`撤销设备 ${d.name}`}>
          <Trash2 className="w-3 h-3 shrink-0" />
          <span className="hidden sm:inline">撤销</span>
        </Button>
      </div>
    </div>
  )
}
