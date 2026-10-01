/**
 * 通知页：Bark 推送配置 + 通知偏好开关
 */

import { useEffect, useState } from "react"
import { useApp } from "@/hooks/useApp"
import { Button, Send, Switch } from "@/components/ui"
import { trimTrailingSlash } from "@/lib/utils"

const BARK_URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*\/[A-Za-z0-9._-]+$/

export function NotificationsPage() {
  const { api, deviceId, devices, refreshDevices, notificationPrefs, setNotificationPrefs } = useApp()
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null)

  const currentDevice = devices.find((d) => d.id === deviceId)
  const [barkUrl, setBarkUrl] = useState(currentDevice?.bark_url || "")
  const [barkSaved, setBarkSaved] = useState(false)

  useEffect(() => {
    if (!barkSaved) setBarkUrl(currentDevice?.bark_url || "")
  }, [currentDevice?.bark_url, barkSaved])

  const togglePref = (key: keyof typeof notificationPrefs) => {
    setNotificationPrefs({ [key]: !notificationPrefs[key] })
  }

  const saveBark = async () => {
    setSaving(true)
    setMsg(null)
    const trimmed = trimTrailingSlash(barkUrl)
    try {
      if (trimmed && !BARK_URL_RE.test(trimmed)) {
        setMsg({ kind: "err", text: "Bark URL 格式应为 https://host/DEVICEKEY" })
        return
      }
      await api.setDeviceBarkUrl(deviceId, trimmed)
      setBarkSaved(true)
      await refreshDevices()
      setMsg({ kind: "ok", text: trimmed ? "Bark 地址已保存" : "Bark 已清空" })
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "保存失败" })
    } finally {
      setSaving(false)
    }
  }

  const testBark = async () => {
    setTesting(true)
    setMsg(null)
    const trimmed = trimTrailingSlash(barkUrl)
    try {
      if (!trimmed) {
        setMsg({ kind: "err", text: "请先填写并保存 Bark URL" })
        return
      }
      await api.testBark(trimmed)
      setMsg({ kind: "ok", text: "Bark 测试通知已发送，请检查 iPhone" })
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Bark 发送失败" })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="glass p-5 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center border"
            style={{
              background: barkUrl ? "var(--success-tint)" : "var(--bg-subtle)",
              borderColor: "var(--hairline)",
            }}
          >
            <Send className="w-5 h-5" style={{ color: barkUrl ? "var(--success)" : "var(--text-secondary)" }} />
          </div>
          <div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">Bark 推送</div>
            <div className="text-xs mt-1 text-[var(--text-secondary)]">iOS 通知通道</div>
          </div>
        </div>

        <p className="text-xs text-[var(--text-tertiary)] mb-3 leading-relaxed">
          在 iPhone 上安装{" "}
          <a
            href="https://apps.apple.com/app/bark/id1403753865"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--accent)] underline"
          >
            Bark App
          </a>
          ，复制首页的 URL（形如 <code className="font-mono">https://api.day.app/xxxxx</code>）粘贴到下面，保存后即可接收通知。
          Bark 只收到“有新剪贴板”提示，不含明文内容，保证端到端加密隐私。
        </p>

        <label className="field-label mb-2">Bark URL</label>
        <input
          type="url"
          value={barkUrl}
          onChange={(e) => {
            setBarkUrl(e.currentTarget.value)
            setBarkSaved(false)
          }}
          placeholder="https://api.day.app/你的DeviceKey"
          className="field-input field-input--mono mb-3"
        />

        <div className="flex gap-2">
          <Button variant="secondary" onClick={saveBark} isDisabled={saving || testing} className="flex-1">
            {saving ? "保存中…" : "保存"}
          </Button>
          <Button variant="ghost" onClick={testBark} isDisabled={testing || saving || !barkUrl.trim()} className="flex-1">
            <Send className="w-3.5 h-3.5" /> {testing ? "发送中…" : "测试 Bark"}
          </Button>
        </div>

        {msg && (
          <p className={`mt-3 text-xs ${msg.kind === "ok" ? "text-[var(--success)]" : "text-[var(--error)]"}`}>
            {msg.text}
          </p>
        )}
      </div>

      <div className="glass overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-[var(--hairline)]">
          <h2 className="section-label">通知偏好</h2>
        </div>
        <div className="divide-y divide-[color:var(--hairline)]">
          <PrefRow
            label="剪贴板通知"
            desc="其他设备复制内容时通知我"
            checked={notificationPrefs.new_clipboard}
            onChange={() => togglePref("new_clipboard")}
          />
          <PrefRow
            label="设备通知"
            desc="设备上线 / 离线时通知我"
            checked={notificationPrefs.device_online}
            onChange={() => togglePref("device_online")}
          />
          <PrefRow
            label="新设备加入"
            desc="有新设备加入时通知我"
            checked={notificationPrefs.device_added}
            onChange={() => togglePref("device_added")}
          />
          <PrefRow
            label="安全提醒"
            desc="异常登录 / 安全事件通知"
            checked={notificationPrefs.security_alert}
            onChange={() => togglePref("security_alert")}
          />
        </div>
      </div>
    </div>
  )
}

function PrefRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string
  desc: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="px-4 py-3 flex items-center justify-between">
      <div>
        <div className="text-[13px] font-medium text-[var(--text-primary)]">{label}</div>
        <div className="text-[11px] mt-1 text-[var(--text-tertiary)]">{desc}</div>
      </div>
      <Switch checked={checked} onChange={onChange} aria-label={label} />
    </div>
  )
}
