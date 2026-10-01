/**
 * 设置 · API Token 管理（curl / CLI 调用认证）
 */

import { useEffect, useState } from "react"
import { useApp } from "@/hooks/useApp"
import { useCopy } from "@/hooks/useCopy"
import { Button, Key, Copy, Trash2, Plus } from "@/components/ui"
import { ConfirmSheet } from "@/components/ConfirmSheet"
import { Section } from "./Section"
import { trimTrailingSlash } from "@/lib/utils"
import type { ApiToken } from "@cloudclipboard/types"

type Msg = { kind: "ok" | "err"; text: string } | null

export function ApiTokenSection() {
  const { api, isConfigured, config } = useApp()
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [tokenName, setTokenName] = useState("")
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const { copied, copy } = useCopy(1500)

  const load = async () => {
    if (!isConfigured) return
    try {
      const list = await api.fetchApiTokens()
      // 防御非预期响应（旧版服务端/代理兜底可能缺 tokens 字段），避免 undefined.length 整页崩溃
      setTokens(Array.isArray(list) ? list : [])
    } catch {
      // 忽略加载失败
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured])

  const create = async () => {
    if (!isConfigured) return setMsg({ kind: "err", text: "请先在上方保存并刷新连接" })
    setBusy(true)
    setMsg(null)
    try {
      const res = await api.createApiToken(tokenName.trim() || "api")
      setNewToken(res.api_token)
      setTokenName("")
      setMsg({ kind: "ok", text: "Token 已生成！请立即复制保存，明文只显示这一次。" })
      await load()
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "生成失败" })
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    try {
      await api.deleteApiToken(id)
      setRevokingId(null)
      setMsg({ kind: "ok", text: "Token 已吊销" })
      await load()
    } catch (e) {
      setRevokingId(null)
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "删除失败" })
    }
  }

  const base = trimTrailingSlash(config.workerUrl)
  const curlExample = newToken
    ? `# 明文（不建议，服务器可见）
curl -X POST "${base}/api/clipboard/plain" \\
  -H "Authorization: Bearer ${newToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"content":"要上传的剪贴板内容","confirmPlaintext":true}'

# E2EE（推荐）：传入 passphrase 自动加密
curl -X POST "${base}/api/clipboard/plain" \\
  -H "Authorization: Bearer ${newToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"content":"要上传的剪贴板内容","passphrase":"你的种子短语"}'`
    : ""

  return (
    <Section title="API Token" icon={<Key className="w-3.5 h-3.5" />}>
      <div className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Key className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
          <div className="flex-1">
            <div className="text-xs font-medium text-[var(--text-primary)]">生成 API Token</div>
            <div className="text-[11px] text-[var(--text-tertiary)] mt-1 leading-relaxed">
              用 <code className="font-mono">curl</code> / 脚本直接调用 API 上传剪贴板，无需浏览器登录。
              服务器只保存 Token 哈希，明文仅生成时显示一次。
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input
            value={tokenName}
            onChange={(e) => setTokenName(e.currentTarget.value)}
            placeholder="备注（可选，如 macbook）"
            className="field-input flex-1"
          />
          <Button size="sm" variant="secondary" onClick={create} isDisabled={busy || !isConfigured}>
            <Plus className="w-3 h-3" />
            {busy ? "生成中…" : "生成"}
          </Button>
        </div>

        {newToken && (
          <div className="mt-3 rounded-lg border p-3" style={{ borderColor: "var(--accent)", background: "var(--accent-tint)" }}>
            <div className="flex items-center justify-between gap-2">
              <code className="text-[11px] font-mono break-all text-[var(--accent)]">{newToken}</code>
              <Button size="sm" variant="ghost" onClick={() => copy(newToken)} isDisabled={copied}>
                <Copy className="w-3 h-3" />
                {copied ? "已复制" : "复制"}
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-[var(--error)]">请立即复制保存，此 Token 明文不会再次显示。</p>
            {curlExample && (
              <pre className="mt-2 p-2 rounded-lg overflow-x-auto text-[10px] font-mono bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                {curlExample}
              </pre>
            )}
          </div>
        )}

        {tokens.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
              已生成的 Token
            </div>
            {tokens.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2 rounded-lg border border-[var(--hairline)] px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium truncate text-[var(--text-primary)]">{t.name || "api"}</div>
                  <div className="text-[10px] text-[var(--text-tertiary)] font-mono">
                    创建 {new Date(t.created_at).toLocaleString()} ·
                    {t.expires_at ? ` 过期 ${new Date(t.expires_at).toLocaleString()}` : " 永久有效"}
                    {t.last_used_at ? ` · 最近使用 ${new Date(t.last_used_at).toLocaleString()}` : " · 未使用"}
                  </div>
                </div>
                <button
                  onClick={() => setRevokingId(t.id)}
                  className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--error)] hover:bg-[var(--bg-subtle)]"
                  title="吊销"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {msg && (
          <p className={`mt-2 text-[11px] ${msg.kind === "ok" ? "text-[var(--success)]" : "text-[var(--error)]"}`}>
            {msg.text}
          </p>
        )}

        <ConfirmSheet
          open={!!revokingId}
          title="吊销该 Token？"
          description="吊销后使用该 Token 的调用将立即失效，且不可恢复。"
          confirmLabel="确认吊销"
          danger
          onConfirm={() => revokingId && remove(revokingId)}
          onCancel={() => setRevokingId(null)}
        />
      </div>
    </Section>
  )
}
