/**
 * 设置 · 安全 · 种子短语（master key）
 * masterKey = PBKDF2(seedPhrase, salt="cloudclipboard:v1:"+userId)
 */

import { useEffect, useState } from "react"
import { useApp } from "@/hooks/useApp"
import { Button, Key, ChevronDown, Spinner, Shield } from "@/components/ui"
import { ConfirmSheet } from "@/components/ConfirmSheet"
import { Section } from "./Section"

type Msg = { kind: "ok" | "err"; text: string } | null

export function MasterKeySection() {
  return (
    <Section title="安全" icon={<Shield className="w-3.5 h-3.5" />}>
      <div className="px-4 py-3 flex items-center gap-3">
        <Shield className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
        <div className="flex-1">
          <div className="text-xs font-medium text-[var(--text-primary)]">Cloudflare Zero Trust</div>
          <div className="text-[11px] text-[var(--text-tertiary)] mt-1">
            认证由 Cloudflare Access 托管，无需本地 token 或配对码。退出登录请访问 Cloudflare Access 会话管理。
          </div>
        </div>
      </div>
      <SeedKeyCard />
    </Section>
  )
}

function SeedKeyCard() {
  const { userId, refreshList } = useApp()
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [seed, setSeed] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const [mode, setMode] = useState<"setup" | "change" | "">("")
  const [confirmReset, setConfirmReset] = useState(false)
  const [showExplain, setShowExplain] = useState(false)

  useEffect(() => {
    const check = async () => {
      const { getMasterKeyFromIndexedDB, getMasterKeySourceFromIndexedDB } = await import("@cloudclipboard/crypto")
      const [stored, source] = await Promise.all([
        getMasterKeyFromIndexedDB(),
        getMasterKeySourceFromIndexedDB(),
      ])
      setHasKey(!!stored)
      if (stored) {
        setMsg({
          kind: "ok",
          text:
            source === "seed"
              ? "已通过种子短语派生"
              : "当前为旧版随机密钥，建议重置为种子短语",
        })
      }
    }
    check()
  }, [])

  const doSetup = async () => {
    const seedTrimmed = seed.trim()
    if (!seedTrimmed) return setMsg({ kind: "err", text: "请输入种子短语" })
    if (seedTrimmed !== confirm.trim()) return setMsg({ kind: "err", text: "两次输入的短语不一致" })
    if (seedTrimmed.length < 8) return setMsg({ kind: "err", text: "种子短语至少 8 个字符" })
    if (!userId) return setMsg({ kind: "err", text: "用户身份未就绪，请先连接并刷新" })
    setBusy(true)
    setMsg(null)
    try {
      const { setupMasterKeyFromSeed } = await import("@cloudclipboard/crypto")
      await setupMasterKeyFromSeed(seedTrimmed, userId)
      setSeed("")
      setConfirm("")
      setHasKey(true)
      setMode("")
      setMsg({ kind: "ok", text: "种子短语已设置！本机已能加解密所有数据" })
      await refreshList()
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "设置失败" })
    } finally {
      setBusy(false)
    }
  }

  const doReset = async () => {
    const { clearMasterKeyFromIndexedDB } = await import("@cloudclipboard/crypto")
    await clearMasterKeyFromIndexedDB()
    setConfirmReset(false)
    setHasKey(false)
    setSeed("")
    setConfirm("")
    setMode("setup")
    setMsg(null)
  }

  return (
    <div className="px-4 py-3 border-t border-[var(--hairline)]">
      <div className="flex items-center gap-3">
        <Key className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
        <div className="flex-1">
          <div className="text-xs font-medium text-[var(--text-primary)]">种子短语（Master Key）</div>
          <p className="text-[11px] text-[var(--text-tertiary)] mt-1 leading-relaxed">
            用「一句私密话」跨设备解密剪贴板。任何设备输入同一短语即可算出同一把加密密钥，
            <strong className="text-[var(--text-secondary)]"> 不需要导出或同步 key</strong>。
          </p>
          <button
            onClick={() => setShowExplain((v) => !v)}
            className="mt-1 flex items-center gap-1 text-[11px] font-medium text-[var(--accent)] hover:underline cursor-pointer"
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${showExplain ? "rotate-180" : ""}`} />
            {showExplain ? "收起说明" : "查看详细说明"}
          </button>
          {showExplain && (
            <p className="mt-1 text-[11px] text-[var(--text-tertiary)] leading-relaxed animate-fade-in">
              短语只在你的浏览器里，服务器永远见不到 → 真 E2EE。任何设备输入同一短语即可恢复解密能力；
              修改后所有设备需输入新的种子短语才能解密新数据，旧数据需要用旧短语才能解密。
            </p>
          )}
        </div>
      </div>

      {msg && <p className={`mt-2 text-[11px] ${msg.kind === "ok" ? "text-[var(--success)]" : "text-[var(--error)]"}`}>{msg.text}</p>}

      {hasKey === false && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-[var(--text-secondary)]">输入你的种子短语（只在你本地，用于派生加密密钥）。</p>
          <input
            type="password"
            value={seed}
            onChange={(e) => setSeed(e.currentTarget.value)}
            placeholder="输入种子短语（例如：我的秘密生活密码）"
            className="field-input"
            aria-label="种子短语"
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.currentTarget.value)}
            placeholder="再次输入确认"
            className="field-input"
            aria-label="确认种子短语"
          />
          <Button size="sm" variant="secondary" onClick={doSetup} isDisabled={busy || !userId} className="w-full">
            {busy ? <Spinner size={13} /> : "设置种子短语"}
          </Button>
          {!userId && <p className="text-[10px] text-[var(--error)]">请先在上方保存并刷新连接</p>}
        </div>
      )}

      {hasKey === true && mode === "" && (
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" variant="danger" onClick={() => { setMode("change"); setMsg(null) }} isDisabled={busy}>
            修改种子短语
          </Button>
          <Button size="sm" variant="danger" onClick={() => setConfirmReset(true)} isDisabled={busy}>
            重置密钥
          </Button>
        </div>
      )}

      {hasKey === true && mode === "change" && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-[var(--text-secondary)]">
            修改后，所有设备需输入新的种子短语才能解密新数据。旧数据需要用旧短语才能解密。
          </p>
          <input
            type="password"
            value={seed}
            onChange={(e) => setSeed(e.currentTarget.value)}
            placeholder="新的种子短语（至少 8 个字符）"
            className="field-input"
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.currentTarget.value)}
            placeholder="再次输入确认"
            className="field-input"
            aria-label="确认种子短语"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={doSetup} isDisabled={busy}>
              {busy ? "修改中…" : "确认修改"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setMode(""); setSeed(""); setConfirm("") }}
              isDisabled={busy}
            >
              取消
            </Button>
          </div>
        </div>
      )}

      <ConfirmSheet
        open={confirmReset}
        title="重置加密密钥？"
        description="旧密钥加密的历史记录将无法解密（除非重新输入相同的种子短语）。此操作不可恢复。"
        confirmLabel="确认重置"
        danger
        onConfirm={doReset}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  )
}
