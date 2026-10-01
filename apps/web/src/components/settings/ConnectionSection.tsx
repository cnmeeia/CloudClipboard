/**
 * 设置 · 连接：Worker API 地址、设备名称、连接状态。
 */

import { useState } from "react"
import { useApp } from "@/hooks/useApp"
import { Button, Cloud, RefreshCw } from "@/components/ui"
import { Section } from "./Section"
import { trimTrailingSlash } from "@/lib/utils"

export function ConnectionSection() {
  const { config, setWorkerUrl, isConfigured, refreshList, renameDevice } = useApp()
  const [url, setUrl] = useState(config.workerUrl)
  const [name, setName] = useState(config.deviceName)
  const [testState, setTestState] = useState<"idle" | "testing" | "ok" | "fail">("idle")
  const [testMsg, setTestMsg] = useState("")

  const testConnection = async () => {
    setTestState("testing")
    setTestMsg("")
    try {
      const res = await fetch(`${trimTrailingSlash(url)}/api/health`)
      const data = (await res.json()) as { success?: boolean }
      if (data.success) {
        setTestState("ok")
        setTestMsg("连接成功")
        setWorkerUrl(url)
      } else {
        setTestState("fail")
        setTestMsg("服务异常（可能缺少密钥配置）")
      }
    } catch {
      setTestState("fail")
      setTestMsg("无法连接")
    }
  }

  // 保存时统一处理地址 + 设备名，避免 onBlur 与按钮双发
  const save = () => {
    setWorkerUrl(url)
    if (name.trim() && name.trim() !== config.deviceName) {
      void renameDevice(name.trim())
    }
    refreshList()
  }

  return (
    <Section title="连接" icon={<Cloud className="w-3.5 h-3.5" />}>
      <div className="px-4 py-3 flex flex-wrap items-center gap-3">
        <label htmlFor="api-url" className="text-xs font-medium w-16 shrink-0 text-[var(--text-secondary)]">
          API 地址
        </label>
        <input
          id="api-url"
          value={url}
          onChange={(e) => {
            setUrl(e.currentTarget.value)
            if (testState === "ok" || testState === "fail") setTestState("idle")
          }}
          placeholder="https://your-worker.workers.dev"
          className="field-input field-input--mono field-input--compact flex-1"
        />
        <Button size="sm" variant="ghost" onClick={testConnection} isDisabled={testState === "testing"}>
          {testState === "testing" ? "测试中…" : "测试"}
        </Button>
      </div>
      {testMsg && (
        <div className={`px-4 pb-3 text-xs ${testState === "ok" ? "text-[var(--success)]" : "text-[var(--error)]"}`}>
          {testMsg}
        </div>
      )}
      <div className="px-4 py-3 flex flex-wrap items-center gap-3 border-t border-[var(--hairline)]">
        <label htmlFor="device-name" className="text-xs font-medium w-16 shrink-0 text-[var(--text-secondary)]">
          设备名称
        </label>
        <input
          id="device-name"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          className="field-input field-input--compact flex-1"
        />
        <span className="text-[10px] text-[var(--text-tertiary)] font-mono">{config.deviceId}</span>
      </div>
      <div className="px-4 py-3 flex flex-wrap items-center gap-3 border-t border-[var(--hairline)]">
        <span className="text-xs font-medium w-16 shrink-0 text-[var(--text-secondary)]">状态</span>
        <div className="flex-1 text-xs">
          <span className={isConfigured ? "text-[var(--success)]" : "text-[var(--text-tertiary)]"}>
            {isConfigured ? "● 已连接" : "○ 未连接"}
          </span>
        </div>
        <Button size="sm" variant="ghost" onClick={save}>
          <RefreshCw className="w-3 h-3" />
          保存并刷新
        </Button>
      </div>
    </Section>
  )
}
