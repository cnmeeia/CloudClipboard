/**
 * 设置 · 存储 / 关于
 */

import { useEffect, useState } from "react"
import { useApp } from "@/hooks/useApp"
import { Database, Info } from "@/components/ui"
import { Section } from "./Section"
import { trimTrailingSlash } from "@/lib/utils"
import { SERVICE_VERSION } from "@cloudclipboard/shared"

export function StorageSection() {
  return (
    <Section title="存储" icon={<Database className="w-3.5 h-3.5" />}>
      <div className="px-4 py-3 flex items-center gap-3">
        <div className="flex-1">
          <div className="text-xs font-medium text-[var(--text-primary)]">剪贴板记录</div>
          <div className="text-[11px] text-[var(--text-tertiary)] mt-1">
            内容经 AES-256-GCM 加密后存储于 Cloudflare（D1 元数据 + R2 文件）。未设置有效期时永久保存，仅在明确选择 30 分钟～7 天等时长后才会自动过期。
          </div>
        </div>
      </div>
    </Section>
  )
}

export function AboutSection() {
  const { config, isConfigured } = useApp()
  const [deployment, setDeployment] = useState<{ id: string; tag?: string; timestamp?: number } | null>(null)

  useEffect(() => {
    if (!isConfigured) return
    let cancelled = false
    const fetchVersion = async () => {
      try {
        const res = await fetch(`${trimTrailingSlash(config.workerUrl)}/api/health`, { redirect: "manual" })
        if (res.type === "opaqueredirect" || res.status === 0) return
        if (!res.ok) return
        const data = (await res.json()) as {
          deployment?: { id: string; tag?: string; timestamp?: number } | null
        }
        if (!cancelled) setDeployment(data.deployment ?? null)
      } catch {
        // 离线或未登录时静默忽略
      }
    }
    fetchVersion()
    return () => {
      cancelled = true
    }
  }, [isConfigured, config.workerUrl])

  return (
    <Section title="关于" icon={<Info className="w-3.5 h-3.5" />}>
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="text-xs font-medium text-[var(--text-primary)]">CloudClipboard</div>
          <span className="rounded-md px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-[var(--accent-tint)] text-[var(--accent)]">
            v{SERVICE_VERSION}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2 text-[11px]">
          <span className="text-[var(--text-tertiary)] shrink-0">Current Version ID</span>
          {deployment ? (
            <>
              <code className="font-mono text-[10px] truncate text-[var(--text-secondary)]" title={deployment.id}>
                {deployment.id}
              </code>
              {deployment.timestamp && (
                <span className="text-[10px] text-[var(--text-tertiary)] shrink-0 ml-auto">
                  {new Date(deployment.timestamp).toLocaleString()}
                </span>
              )}
            </>
          ) : (
            <span className="text-[10px] text-[var(--text-tertiary)]">
              {isConfigured ? "读取中…（需先登录 Access）" : "连接后显示"}
            </span>
          )}
        </div>
        <div className="text-[11px] text-[var(--text-tertiary)] mt-2 leading-relaxed">
          PWA + Bark + E2EE + Cloudflare · 个人私有 Universal Clipboard
          <br />
          无需原生 App · 无需 Apple Developer Account · Copy once, available everywhere.
        </div>
      </div>
    </Section>
  )
}
