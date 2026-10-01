/**
 * 设备页（提示词 A：卡片化 + 本机/其他分区 + 统计标题）
 *
 * V2 设计优化：
 * - 标题区更紧凑有层级
 * - 空状态用图标替代 emoji
 * - 微调间距与视觉细节
 */

import { useEffect, useMemo, useState } from "react"
import { useApp } from "@/hooks/useApp"
import { Reveal } from "@/components/Reveal"
import { DeviceCard } from "@/components/DeviceCard"
import { ConfirmSheet } from "@/components/ConfirmSheet"
import { Button, RefreshCw, Monitor, EmptyState, Spinner } from "@/components/ui"
import type { Device } from "@cloudclipboard/types"

export function DevicesPage() {
  const { devices, refreshDevices, api, deviceId } = useApp()
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [renameBusy, setRenameBusy] = useState(false)
  const [renameError, setRenameError] = useState("")
  const [busy, setBusy] = useState(false)
  const [revokeError, setRevokeError] = useState("")
  // 待确认撤销的设备（打开底部 Sheet / Dialog）
  const [revoking, setRevoking] = useState<Device | null>(null)

  useEffect(() => {
    refreshDevices()
  }, [refreshDevices])

  const onlineCount = useMemo(() => devices.filter((d) => d.online).length, [devices])

  const currentDevice = useMemo(() => devices.find((d) => d.id === deviceId), [devices, deviceId])
  const otherDevices = useMemo(
    () => devices.filter((d) => d.id !== deviceId),
    [devices, deviceId]
  )

  const startRename = (d: Device) => {
    setRenamingId(d.id)
    setRenameValue(d.name)
  }

  const submitRename = async (id: string) => {
    const name = renameValue.trim()
    if (!name) {
      setRenamingId(null)
      setRenameError("")
      return
    }
    setRenameBusy(true)
    setRenameError("")
    try {
      await api.renameDevice(id, name)
      setRenamingId(null)
      refreshDevices()
    } catch (e) {
      // 内联错误提示（交互引擎：失败可见且可恢复），保留输入框让用户修正重试
      setRenameError(e instanceof Error ? e.message : "重命名失败，请稍后重试")
    } finally {
      setRenameBusy(false)
    }
  }

  // 请求撤销：弹出二次确认
  const requestRevoke = (d: Device) => {
    setRevoking(d)
    setRevokeError("")
  }

  const confirmRevoke = async () => {
    if (!revoking) return
    setBusy(true)
    setRevokeError("")
    try {
      await api.deleteDevice(revoking.id)
      setRevoking(null)
      refreshDevices()
    } catch (e) {
      // 保留弹窗并内联展示错误，用户可重试或取消（失败可恢复）
      setRevokeError(e instanceof Error ? e.message : "撤销失败，请稍后重试")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {/* 顶部标题 + 统计 + 刷新 */}
      <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <span className="text-xs font-normal text-[var(--text-secondary)] shrink-0 whitespace-nowrap">
            {devices.length} 台 · {onlineCount} 在线
          </span>
          <p className="text-xs mt-1 text-[var(--text-secondary)]">
            同一账户下的所有设备，通过 Cloudflare Access 认证
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={refreshDevices} className="shrink-0">
          <RefreshCw className="w-3.5 h-3.5" />
          刷新
        </Button>
      </div>

      {/* 本机分区 */}
      {currentDevice && (
        <div className="mb-5">
          <h2 className="section-label mb-2">本机</h2>
          <Reveal index={0} direction="up">
            <DeviceCard
              device={currentDevice}
              isCurrent
              onRename={startRename}
              onRevoke={requestRevoke}
            />
          </Reveal>
          {/* 重命名当前设备输入 */}
          {renamingId === currentDevice.id && (
            <RenameInput
              value={renameValue}
              onChange={setRenameValue}
              error={renameError}
              busy={renameBusy}
              onEnter={() => submitRename(currentDevice.id)}
              onCancel={() => { setRenamingId(null); setRenameError("") }}
            />
          )}
        </div>
      )}

      {/* 其他设备分区 */}
      <div>
        <h2 className="section-label mb-2">其他设备 · {otherDevices.length}</h2>
        {otherDevices.length > 0 ? (
          <div className="space-y-3">
            {otherDevices.map((d, i) => (
              <Reveal key={d.id} index={i + 1} direction="up">
                <DeviceCard
                  device={d}
                  isCurrent={false}
                  onRename={startRename}
                  onRevoke={requestRevoke}
                />
                {/* 重命名其他设备输入 */}
                {renamingId === d.id && (
                  <RenameInput
                    value={renameValue}
                    onChange={setRenameValue}
                    error={renameError}
                    busy={renameBusy}
                    onEnter={() => submitRename(d.id)}
                    onCancel={() => { setRenamingId(null); setRenameError("") }}
                  />
                )}
              </Reveal>
            ))}
          </div>
        ) : (
          <Reveal index={1} direction="up">
            <div className="glass">
              <EmptyState
                icon={Monitor}
                title="还没有其他设备"
                description="在另一台设备用同一账号打开即可自动加入"
              />
            </div>
          </Reveal>
        )}
      </div>

      {/* 撤销二次确认（移动端 Sheet / 桌面 Dialog） */}
      <ConfirmSheet
        open={!!revoking}
        title={`撤销设备「${revoking?.name ?? ""}」？`}
        description="撤销后该设备将无法再解密剪贴板，其产生的剪贴板记录将一并删除，此操作不可恢复。"
        confirmLabel="确认撤销"
        danger
        busy={busy}
        error={revokeError}
        onConfirm={confirmRevoke}
        onCancel={() => {
          if (busy) return
          setRevoking(null)
          setRevokeError("")
        }}
      />
    </div>
  )
}


/**
 * RenameInput：设备重命名内联输入
 * 显式保存/取消（Enter 提交、Esc 取消），忙态防重复提交，失败内联可重试。
 */
function RenameInput({
  value,
  onChange,
  error,
  busy,
  onEnter,
  onCancel,
}: {
  value: string
  onChange: (v: string) => void
  error: string
  busy: boolean
  onEnter: () => void
  onCancel: () => void
}) {
  return (
    <div className="mt-2">
      <input
        value={value}
        onChange={(e) => {
          if (!busy) onChange(e.currentTarget.value)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") onEnter()
          if (e.key === "Escape") onCancel()
        }}
        autoFocus
        disabled={busy}
        aria-invalid={!!error}
        aria-label="重命名设备"
        className="field-input"
      />
      {error && (
        <p role="alert" className="mt-1.5 text-[11px] text-[var(--error)]">
          {error}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" onClick={onEnter} isDisabled={busy}>
          {busy ? <Spinner size={12} onAccent /> : null}
          保存
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} isDisabled={busy}>
          取消
        </Button>
      </div>
    </div>
  )
}
