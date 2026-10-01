/**
 * SW 更新状态的外部 store（Issue #86 后续）
 *
 * 用最小的发布/订阅实现，让 `setupSWUpdate`（非 React 上下文，main.tsx 里调用）
 * 能把「有新版本可用」广播给 React 组件（UpdatePrompt），而不必引入额外依赖。
 */

type Listener = () => void

let listeners: Listener[] = []

/** 订阅「新版本可用」事件，返回取消订阅函数 */
export function onUpdateReady(fn: Listener): () => void {
  listeners.push(fn)
  return () => {
    listeners = listeners.filter((l) => l !== fn)
  }
}

/** 广播「新版本可用」（由 setupSWUpdate 调用） */
export function emitUpdateReady(): void {
  for (const l of [...listeners]) l()
}

/** 测试用：清空订阅者，避免用例间互相污染 */
export function resetUpdateListeners(): void {
  listeners = []
}

// ── 应用更新：由 main.tsx 注入真实实现，避免 store 直接依赖 window ──
let applier: (() => void) | null = null

export function setUpdateApplier(fn: () => void): void {
  applier = fn
}

export function applyUpdate(): void {
  applier?.()
}
