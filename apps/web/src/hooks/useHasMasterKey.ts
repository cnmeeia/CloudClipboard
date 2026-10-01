/**
 * 本机主密钥（种子短语）状态探测。
 * Dashboard 概览卡与设置 · 安全区共用，避免各自重复查 IndexedDB。
 * 返回 null = 探测中；boolean = 是否已有可用主密钥。
 */

import { useEffect, useState } from "react"

export function useHasMasterKey(): boolean | null {
  const [hasKey, setHasKey] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    import("@cloudclipboard/crypto")
      .then(({ getMasterKeyFromIndexedDB }) => getMasterKeyFromIndexedDB())
      .then((key) => {
        if (!cancelled) setHasKey(!!key)
      })
      .catch(() => {
        if (!cancelled) setHasKey(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return hasKey
}
