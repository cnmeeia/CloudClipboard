/**
 * Onboarding（简化版，CF Access）
 * 目标：60 秒内完成"开始使用"
 * 认证由 Cloudflare Zero Trust（Access）负责，用户只需填写 Worker 地址即可。
 * 设备自动注册（deviceId 持久化在 localStorage，升级后数据保留）。
 *
 * V2 设计优化：
 * - 更清晰的层级结构与信息架构
 * - 强调主操作按钮
 */

import { useState } from "react"
import { useApp } from "@/hooks/useApp"
import { Reveal } from "@/components/Reveal"
import { BlurReveal } from "@/components/BlurReveal"
import { Button, ArrowRight, Cloud, Shield, Spinner } from "@/components/ui"
import { trimTrailingSlash } from "@/lib/utils"

export function Onboarding() {
  const { config, setWorkerUrl, isConfigured } = useApp()
  const [url, setUrl] = useState(config.workerUrl)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const handleConnect = async () => {
    setError("")
    setBusy(true)
    try {
      const target = url.trim() || window.location.origin
      if (target) {
        setWorkerUrl(target)
        // 探测健康 + 认证。
        // 注意：整个站点在 Cloudflare Access 之后，未登录时 Access 会在边缘
        // 返回登录页（HTTP 200 + HTML，请求到不了 Worker）。因此不能只看 res.ok，
        // 必须确认返回的是 Worker 的 JSON，否则视为未登录 / 地址不可达。
        const base = trimTrailingSlash(target)
        const res = await fetch(`${base}/api/health`, {
          headers: { Accept: "application/json" },
          redirect: "manual",
        }).catch(() => null)
        // Access 未登录时边缘 302 跳转到跨域 cloudflareaccess.com 登录页；
        // redirect:manual 下表现为 opaque-redirect（status 0 / type opaqueredirect）。
        const needsAccessLogin =
          !!res && (res.type === "opaqueredirect" || res.status === 0)
        if (needsAccessLogin) {
          setError("需要先登录 Cloudflare Access。已在新标签页打开登录页，完成登录后返回再试。")
          window.open(base, "_blank", "noopener")
        } else if (!res || !res.ok) {
          setError("无法连接 Worker API，请检查地址（需已通过 Cloudflare Access 认证）。")
        } else {
          const isJson = (res.headers.get("content-type") || "").includes("application/json")
          if (!isJson) {
            // 返回的是 Access 登录页 / 其他 HTML：引导用户先完成 Access 登录
            setError("需要先登录 Cloudflare Access。请在新标签页打开该地址完成登录后再返回。")
            window.open(base, "_blank", "noopener")
          }
          // 是 JSON → Worker 已可达且已通过认证，继续
        }
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-4 relative overflow-hidden">
      <div className="w-full max-w-md glass-strong p-8 rounded-2xl animate-pop-in relative z-10">
        <Reveal direction="up">
          <div className="flex items-center gap-3 mb-8">
            <div
              className="w-11 h-11 rounded-[var(--radius-md)] flex items-center justify-center shadow-lg shrink-0"
              style={{ background: "var(--brand-gradient)" }}
            >
              <Cloud className="w-5 h-5 text-[var(--on-accent)]" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">
                CloudClipboard
              </h1>
              <p className="text-[11px] text-[var(--text-tertiary)]">
                Your private clipboard, everywhere.
              </p>
            </div>
          </div>
        </Reveal>

        <div className="space-y-5 animate-fade-in">
          <Reveal index={1} direction="up">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                <BlurReveal text="复制一次，所有设备可用" variant="line" />
              </h2>
              <p className="text-[13px] text-[var(--text-secondary)] mt-2 leading-relaxed">
                个人私有云剪贴板：PWA + Bark + E2EE + Cloudflare Zero Trust。
              </p>
            </div>
          </Reveal>

          <Reveal index={2} direction="up">
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--hairline)]">
              <Shield className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <span className="text-xs text-[var(--text-secondary)]">
                通过 Cloudflare Access 安全登录，无需密码或配对码
              </span>
            </div>
          </Reveal>

          <Reveal index={3} direction="up">
            <div>
              <label htmlFor="worker-url" className="field-label">
                Worker 地址
              </label>
              <input
                id="worker-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.currentTarget.value)}
                placeholder={window.location.origin}
                className="field-input field-input--lg mt-2 text-[var(--text-primary)]"
              />
              {error && <p className="text-xs text-[var(--error)] mt-2">{error}</p>}
            </div>
          </Reveal>

          <Reveal index={4} direction="up">
            <Button onClick={handleConnect} isDisabled={busy} className="w-full">
              {busy ? (
                <>
                  <Spinner size={14} onAccent />
                  连接中…
                </>
              ) : (
                <>
                  {isConfigured ? "重新连接" : "开始使用"}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </Reveal>
        </div>
      </div>
    </div>
  )
}
