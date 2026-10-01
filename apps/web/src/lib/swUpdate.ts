/**
 * Service Worker 更新管理（Issue #86 后续）
 *
 * 背景：用户反馈「#87 修复重复粘贴已合并，但手机上仍是一样」。
 * 排查后根因不是粘贴逻辑，而是 **iOS standalone PWA 长期停留在旧版本**：
 *
 * - `registerSW.js` 只在页面加载时 `register()` 一次，全仓库没有任何
 *   `registration.update()` 调用；
 * - 浏览器只在 **导航**（navigation）时自动检查 SW 更新；
 * - iOS 把 PWA 进程常驻后台，用户从桌面图标「打开」时只是一次
 *   前台恢复（visibilitychange），**没有导航**，于是永远不检查更新；
 * - 结果：合并/部署了新代码，用户几天内仍然跑在旧 bundle 上，即「改了没生效」。
 *
 * 另外原实现的 `controllerchange → window.location.reload()` 有两个问题：
 * 1. `skipWaiting()` + `clients.claim()` 会让每次接管都触发 controllerchange，
 *    实测一次冷启动会 reload 2~3 次（白屏闪烁，且打断用户正在进行的输入）；
 * 2. 无条件 reload 会在用户正在输入/粘贴时把内容清空，观感上很像
 *    「粘贴行为异常」。
 *
 * 本模块的策略：
 * - **主动更新检查**：启动、从后台恢复（visibilitychange）、以及每隔
 *   `UPDATE_INTERVAL_MS` 都调用 `registration.update()`；
 * - **不粗暴刷新**：检测到新版本只广播 `onUpdateReady()`，由 UI 提示用户手动刷新；
 * - **幂等 reload**：标志位保证一次会话最多刷新一次，消除多次刷新。
 */

import { emitUpdateReady } from "./swUpdateStore"

/** 主动检查更新的间隔（30 分钟） */
export const UPDATE_INTERVAL_MS = 30 * 60 * 1000

export interface SWUpdateController {
  /** 主动检查一次更新；返回是否检测到新版本 */
  check: () => Promise<boolean>
  /** 立刻应用更新（激活 waiting 的 SW） */
  applyUpdate: () => void
  /** 释放定时器与事件监听 */
  dispose: () => void
}

/**
 * 是否应该因为 SW 接管而刷新页面。
 *
 * 抽成纯函数便于单测：
 * - 没有 controller（首次安装，页面本身就是最新）→ 不刷新
 * - 本次会话已刷新过 → 不再刷新，避免 reload 循环
 */
export function shouldReloadForUpdate(opts: {
  hasController: boolean
  alreadyReloaded: boolean
}): boolean {
  if (!opts.hasController) return false
  if (opts.alreadyReloaded) return false
  return true
}

/**
 * 启动 SW 更新管理器。
 *
 * @param win      注入的 window（测试可传 fake）
 * @param nav      注入的 navigator
 * @param interval 检查间隔，默认 {@link UPDATE_INTERVAL_MS}
 */
export function setupSWUpdate(
  win: Window,
  nav: Navigator,
  interval: number = UPDATE_INTERVAL_MS
): SWUpdateController | null {
  if (!("serviceWorker" in nav)) return null

  let reloaded = false
  let disposed = false
  let timer: ReturnType<typeof setInterval> | null = null

  const getReg = () => nav.serviceWorker.getRegistration()

  /** 有新 SW 处于 waiting/installing 即视为「新版本可用」 */
  const isUpdateReady = (reg?: ServiceWorkerRegistration | null): boolean =>
    !!reg && !!(reg.waiting || reg.installing)

  const check = async (): Promise<boolean> => {
    if (disposed) return false
    try {
      const reg = await getReg()
      if (!reg) return false
      await reg.update()
      if (isUpdateReady(reg)) {
        emitUpdateReady()
        return true
      }
      return false
    } catch {
      // 离线/权限等问题不应影响应用，静默失败
      return false
    }
  }

  const applyUpdate = () => {
    void getReg().then((reg) => {
      const waiting = reg?.waiting
      if (!waiting) return
      // 通知 sw.ts 响应 SKIP_WAITING（sw.ts 已注册该 message 监听），
      // 由 SW 自行调用 skipWaiting()，页面侧不直接调用（ServiceWorker 类型无此方法）
      waiting.postMessage?.({ type: "SKIP_WAITING" })
    })
  }

  const onControllerChange = () => {
    if (disposed) return
    const allow = shouldReloadForUpdate({
      hasController: !!nav.serviceWorker.controller,
      alreadyReloaded: reloaded,
    })
    if (!allow) return
    reloaded = true
    win.location.reload()
  }

  const onVisibility = () => {
    if (win.document.visibilityState === "visible") void check()
  }

  nav.serviceWorker.addEventListener("controllerchange", onControllerChange)
  win.document.addEventListener("visibilitychange", onVisibility)
  timer = setInterval(() => void check(), interval)

  // 启动时立即检查一次（覆盖「进程常驻、从不导航」的 iOS PWA）
  void check()

  return {
    check,
    applyUpdate,
    dispose: () => {
      disposed = true
      if (timer) clearInterval(timer)
      nav.serviceWorker.removeEventListener("controllerchange", onControllerChange)
      win.document.removeEventListener("visibilitychange", onVisibility)
    },
  }
}
