/**
 * 剪贴板条目解密：RichCard 与 ClipboardDetail 共用。
 * 本地已填充明文（item.content）直接使用；plain=1 的 API Token 明文条目直接返回。
 *
 * 闪屏修复（30s 轮询场景）：
 * 每次轮询服务端返回全新的 item 对象（即使内容完全相同），旧实现的
 * useEffect([item]) 随之重跑，并先无条件 setState("loading")，
 * 导致整屏卡片内容先闪一下骨架再重现。
 * 现在：
 * 1. 模块级按条目 id 缓存已解出的明文，轮询新对象直接命中缓存，不回到 loading；
 * 2. 同一密文的并发解密合并为同一个 Promise；
 * 3. state 惰性初始化时优先读取缓存，首屏也不闪。
 */

import { useEffect, useState } from "react"
import type { ClipboardItem } from "@cloudclipboard/types"
import { decryptItem } from "@/crypto"

export type DecryptState = "loading" | "ready" | "error" | "nokey"

/** 条目 id → 明文（条目过期/删除后缓存随内存回收，不持久化，不落盘） */
const plainCache = new Map<string, string>()
/** 条目 id → 进行中的解密 Promise，去重并发解密 */
const inflight = new Map<string, Promise<string>>()

function decryptCached(item: ClipboardItem): Promise<string> {
  if (plainCache.has(item.id)) return Promise.resolve(plainCache.get(item.id)!)
  const existing = inflight.get(item.id)
  if (existing) return existing
  const job = decryptItem(item)
    .then((plain) => {
      plainCache.set(item.id, plain)
      inflight.delete(item.id)
      return plain
    })
    .catch((e) => {
      inflight.delete(item.id)
      throw e
    })
  inflight.set(item.id, job)
  return job
}

export function useDecryptedItem(item: ClipboardItem) {
  const [text, setText] = useState(() => item.content || plainCache.get(item.id) || "")
  const [state, setState] = useState<DecryptState>(() =>
    item.content || plainCache.has(item.id) ? "ready" : "loading",
  )

  useEffect(() => {
    let cancelled = false

    // 明文随条目下发 / 已在缓存中：直接就绪，绝不先切回 loading（避免轮询闪屏）
    if (item.content) {
      setText(item.content)
      setState("ready")
      return () => {
        cancelled = true
      }
    }
    const cached = plainCache.get(item.id)
    if (cached !== undefined) {
      setText(cached)
      setState("ready")
      return () => {
        cancelled = true
      }
    }

    setState("loading")
    decryptCached(item)
      .then((plain) => {
        if (cancelled) return
        setText(plain)
        setState("ready")
      })
      .catch((e) => {
        if (cancelled) return
        setState(e instanceof Error && e.message === "NO_MASTER_KEY" ? "nokey" : "error")
      })

    return () => {
      cancelled = true
    }
  }, [item])

  return { text, state }
}
