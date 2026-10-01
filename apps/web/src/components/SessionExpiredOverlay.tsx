/**
 * 会话过期覆盖层（Route B：前端优雅闭环）
 *
 * 当 Cloudflare Access 登录失效（返回 401 / UNAUTHORIZED）时，useApp 将
 * sessionExpired 置为 true，此覆盖层接管整页：
 *  - 阻断交互，提示登录已过期
 *  - 提供"重新登录"按钮 → 跳转到 Worker 根地址，由 Access 重新走登录流程
 *  - 每 30s 探活一次 Worker /api/me（需鉴权），一旦认证恢复（200）自动关闭覆盖层并刷新数据
 *
 * 注意：探活必须用需鉴权的端点（如 /api/me）而非公开的 /api/health。
 * /api/health 不校验登录，即使会话过期也始终返回 200，会导致覆盖层被立即
 * 关闭、随后被 30s 轮询再次触发——表现为"刷新一直弹"。
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { useApp } from "@/hooks/useApp"
import { Button, Shield } from "@/components/ui"
import { trimTrailingSlash } from "@/lib/utils"

const PROBE_INTERVAL = 30_000

export function SessionExpiredOverlay() {
  const { config, api, sessionExpired, clearSessionExpired, refreshAll } = useApp()
  const [probing, setProbing] = useState(false)
  const [probeFailed, setProbeFailed] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inFlight = useRef(false)

  const workerBase = trimTrailingSlash(config.workerUrl)

  // 用需鉴权的 /api/me 探活：只有真正登录恢复（200）才关闭覆盖层。
  const probe = useCallback(async () => {
    if (!workerBase || inFlight.current) return
    inFlight.current = true
    setProbing(true)
    setProbeFailed(false)
    try {
      await api.fetchMe()
      // 认证恢复 → 先刷新数据，再关闭覆盖层
      await refreshAll()
      clearSessionExpired()
    } catch {
      setProbeFailed(true)
    } finally {
      inFlight.current = false
      setProbing(false)
    }
  }, [api, workerBase, refreshAll, clearSessionExpired])

  // 立即探一次，再按周期轮询
  useEffect(() => {
    if (!sessionExpired) return
    setProbeFailed(false)
    probe()
    timerRef.current = setInterval(probe, PROBE_INTERVAL)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [sessionExpired, probe])

  if (!sessionExpired) return null

  // 重新登录：跳转到 Worker 根地址，触发 Access 重新认证
  const handleRelogin = () => {
    if (workerBase) {
      window.location.assign(workerBase)
    } else {
      window.location.reload()
    }
  }

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm glass-strong p-8 rounded-[var(--radius-lg)] text-center shadow-2xl animate-pop-in">
        <div className="mx-auto w-14 h-14 rounded-[var(--radius-lg)] bg-[var(--error-tint)] flex items-center justify-center mb-5">
          <Shield className="w-7 h-7 text-[var(--error)]" />
        </div>
        <h2 className="text-lg font-bold tracking-tight">登录已过期</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-2 leading-relaxed">
          你的 Cloudflare Access 会话已失效，请重新登录以继续同步剪贴板。
          <br />
          登录后无需重新配对，数据保持不变。
        </p>

        <div className="flex flex-col gap-2 mt-6">
          <Button onClick={handleRelogin} className="w-full">
            重新登录
          </Button>
          <Button variant="ghost" className="w-full" isDisabled={probing} onClick={probe}>
            {probing ? "正在探活…" : "已登录？刷新检测"}
          </Button>
        </div>

        {probeFailed && !probing && (
          <p className="text-[11px] text-[var(--text-tertiary)] mt-4">
            检测到会话仍不可用，将每 30 秒自动重试。完成登录后会自动恢复。
          </p>
        )}
      </div>
    </div>
  )
}
