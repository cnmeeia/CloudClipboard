/**
 * Dashboard（§44）
 * 系统状态 / 设备数量 / 今日剪贴板 / 最近内容 / 通知状态
 *
 * V2.1 Production Polish:
 * - 移除重复页面标题（TopBar 已显示"概览"）
 * - 优化统计卡片视觉层级
 * - 改进空状态
 */

import { useEffect, useMemo } from "react"
import { Link } from "react-router"
import { useApp } from "@/hooks/useApp"
import { useHasMasterKey } from "@/hooks/useHasMasterKey"
import { RichCard } from "@/components/RichCard"
import { Reveal } from "@/components/Reveal"
import { CardStagger } from "@/components/CardStagger"
import { Smartphone, Bell, ClipboardList, ShieldCheck, ChevronRight, EmptyState } from "@/components/ui"

export function Dashboard() {
  const { items, devices, deviceId, refreshList, refreshDevices, isConfigured } = useApp()
  const hasMasterKey = useHasMasterKey()

  useEffect(() => {
    // 已有数据时静默刷新，避免跨页切换时同步指示器/内容闪烁
    refreshList({ background: items.length > 0 })
    refreshDevices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshList, refreshDevices])

  const todayCount = useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return items.filter((i) => i.created_at >= start.getTime()).length
  }, [items])

  const onlineDevices = useMemo(() => devices.filter((d) => d.online).length, [devices])

  // 通知卡：只反映「当前这台设备」是否真的配置了 Bark（devices 数据来自服务端）
  const currentDevice = useMemo(() => devices.find((d) => d.id === deviceId), [devices, deviceId])
  const barkReady = !!currentDevice?.bark_url

  // 加密卡：真实反映本机是否已设置种子短语（null=探测中按未就绪显示，但不标红）
  const encryptionReady = hasMasterKey === true

  const stats = [
    { label: "设备", value: devices.length, sub: `${onlineDevices} 台在线`, icon: Smartphone, to: "/devices", tone: "ok" as const },
    { label: "今日剪贴板", value: todayCount, sub: `共 ${items.length} 条`, icon: ClipboardList, to: "/clipboard", tone: "ok" as const },
    {
      label: "通知",
      value: barkReady ? 1 : 0,
      sub: !isConfigured ? "待配置" : barkReady ? "本机 Bark 已开启" : "本机未开启",
      icon: Bell,
      to: "/notifications",
      tone: (barkReady ? "ok" : "warn") as "ok" | "warn",
    },
    {
      label: "加密",
      value: encryptionReady ? 1 : 0,
      sub: encryptionReady ? "AES-256-GCM E2EE" : "待设置种子短语",
      icon: ShieldCheck,
      to: "/settings",
      tone: (encryptionReady ? "ok" : "warn") as "ok" | "warn",
    },
  ]

  return (
    <div>
      {/* Stats（数字 tabular-nums 防止刷新抖动） */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-6">
        {stats.map((s, i) => (
          <Reveal key={s.label} index={i} direction="up">
            <Link to={s.to} className="glass card-hover p-4 block group">
              <div className="flex items-center gap-2 mb-2">
                <s.icon
                  className={`w-4 h-4 shrink-0 ${s.tone === "warn" ? "text-[var(--warning)]" : "text-[var(--accent)]"}`}
                />
                <span className="text-[11px] text-[var(--text-tertiary)]">{s.label}</span>
              </div>
              <div className="text-xl font-bold tabular-nums leading-none text-[var(--text-primary)]">
                {s.value}
              </div>
              <div
                className={`text-[11px] mt-2 flex items-center gap-1 ${
                  s.tone === "warn" ? "text-[var(--warning)]" : "text-[var(--text-tertiary)]"
                }`}
              >
                {s.sub}
                <ChevronRight className="w-3 h-3 -translate-x-0.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
              </div>
            </Link>
          </Reveal>
        ))}
      </div>

      {/* 最近内容 */}
      <Reveal index={4} direction="up">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">最近内容</h3>
            <Link to="/clipboard" className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1">
              查看全部
              <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          {items.length === 0 ? (
            <div className="glass">
              <EmptyState
                icon={ClipboardList}
                title="没有同步内容"
                description="在其他设备复制一些内容，它会自动出现在这里。"
              />
            </div>
          ) : (
            <div className="grid gap-3">
              {items.slice(0, 5).map((item, i) => (
                <CardStagger key={item.id} index={i}>
                  <RichCard item={item} />
                </CardStagger>
              ))}
            </div>
          )}
        </div>
      </Reveal>
    </div>
  )
}
