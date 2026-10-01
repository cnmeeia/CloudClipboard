import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { shouldReloadForUpdate, setupSWUpdate, UPDATE_INTERVAL_MS } from "../src/lib/swUpdate"
import { onUpdateReady, resetUpdateListeners } from "../src/lib/swUpdateStore"

/**
 * 回归测试：Issue #86 —— "代码已合并/部署，但 iOS PWA 仍是旧版"。
 *
 * 根因：全仓库没有 registration.update()，而 iOS standalone PWA
 * 从后台恢复时没有导航，浏览器不会自动检查 SW 更新，
 * 于是用户长期停留在旧 bundle（粘贴修复看起来"没生效"）。
 */

/** 最小化的 window / navigator 桩，覆盖 setupSWUpdate 用到的接口 */
function makeEnv(opts: { controller?: boolean; waiting?: boolean } = {}) {
  const swListeners: Record<string, ((e: unknown) => void)[]> = {}
  const docListeners: Record<string, ((e: unknown) => void)[]> = {}
  const update = vi.fn(async () => {})
  const skipWaiting = vi.fn()
  const postMessage = vi.fn()

  const registration = {
    waiting: opts.waiting ? { skipWaiting, postMessage } : null,
    installing: null,
    update,
  } as unknown as ServiceWorkerRegistration

  const nav = {
    serviceWorker: {
      controller: opts.controller ? ({} as ServiceWorker) : null,
      getRegistration: vi.fn(async () => registration),
      addEventListener: (t: string, fn: (e: unknown) => void) => {
        ;(swListeners[t] ||= []).push(fn)
      },
      removeEventListener: (t: string, fn: (e: unknown) => void) => {
        swListeners[t] = (swListeners[t] || []).filter((f) => f !== fn)
      },
    },
  } as unknown as Navigator

  const win = {
    location: { reload: vi.fn() },
    document: {
      visibilityState: "visible" as DocumentVisibilityState,
      addEventListener: (t: string, fn: (e: unknown) => void) => {
        ;(docListeners[t] ||= []).push(fn)
      },
      removeEventListener: (t: string, fn: (e: unknown) => void) => {
        docListeners[t] = (docListeners[t] || []).filter((f) => f !== fn)
      },
    },
  } as unknown as Window

  const fireSW = (t: string) => (swListeners[t] || []).forEach((f) => f({}))
  const fireDoc = (t: string) => (docListeners[t] || []).forEach((f) => f({}))

  return { win, nav, registration, update, skipWaiting, postMessage, fireSW, fireDoc }
}

describe("shouldReloadForUpdate", () => {
  it("首次安装（无 controller）→ 不刷新", () => {
    expect(shouldReloadForUpdate({ hasController: false, alreadyReloaded: false })).toBe(false)
  })

  it("已接管且有 controller → 刷新", () => {
    expect(shouldReloadForUpdate({ hasController: true, alreadyReloaded: false })).toBe(true)
  })

  it("本会话已刷新过 → 不再刷新（消除 2~3 次 reload 循环）", () => {
    expect(shouldReloadForUpdate({ hasController: true, alreadyReloaded: true })).toBe(false)
  })
})

describe("setupSWUpdate（Issue #86 更新失效回归）", () => {
  beforeEach(() => resetUpdateListeners())
  afterEach(() => vi.useRealTimers())

  it("不支持 serviceWorker 时返回 null，不抛错", () => {
    const nav = {} as Navigator
    expect(setupSWUpdate({} as Window, nav)).toBeNull()
  })

  it("启动时立即调用 registration.update()（无需导航即检查更新）", async () => {
    const env = makeEnv()
    const ctrl = setupSWUpdate(env.win, env.nav)
    await Promise.resolve()
    await Promise.resolve()
    expect(env.update).toHaveBeenCalledTimes(1)
    ctrl?.dispose()
  })

  it("页面从后台恢复（visibilitychange → visible）时再次检查更新", async () => {
    const env = makeEnv()
    const ctrl = setupSWUpdate(env.win, env.nav)
    await Promise.resolve()
    const before = env.update.mock.calls.length
    env.fireDoc("visibilitychange")
    await Promise.resolve()
    await Promise.resolve()
    expect(env.update.mock.calls.length).toBeGreaterThan(before)
    ctrl?.dispose()
  })

  it("定时轮询检查更新", async () => {
    vi.useFakeTimers()
    const env = makeEnv()
    const ctrl = setupSWUpdate(env.win, env.nav, 1000)
    const before = env.update.mock.calls.length
    await vi.advanceTimersByTimeAsync(3000)
    expect(env.update.mock.calls.length).toBeGreaterThan(before)
    ctrl?.dispose()
  })

  it("检测到 waiting 的新版本 → 广播 onUpdateReady（而不是粗暴 reload）", async () => {
    const env = makeEnv({ controller: true, waiting: true })
    const spy = vi.fn()
    onUpdateReady(spy)
    const ctrl = setupSWUpdate(env.win, env.nav)
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(spy).toHaveBeenCalled()
    // 关键：不应自动刷新，否则会打断用户正在输入/粘贴的内容
    expect((env.win.location.reload as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
    ctrl?.dispose()
  })

  it("applyUpdate 通知 SW 跳过等待态，让新版本接管", async () => {
    const env = makeEnv({ waiting: true })
    const ctrl = setupSWUpdate(env.win, env.nav)
    for (let i = 0; i < 5; i++) await Promise.resolve()
    ctrl?.applyUpdate()
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(env.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" })
    ctrl?.dispose()
  })

  it("controllerchange 只刷新一次（消除连续 reload）", async () => {
    const env = makeEnv({ controller: true })
    const ctrl = setupSWUpdate(env.win, env.nav)
    await Promise.resolve()
    const reload = env.win.location.reload as unknown as ReturnType<typeof vi.fn>
    env.fireSW("controllerchange")
    env.fireSW("controllerchange")
    env.fireSW("controllerchange")
    expect(reload).toHaveBeenCalledTimes(1)
    ctrl?.dispose()
  })

  it("dispose 后不再检查更新，也不刷新", async () => {
    const env = makeEnv({ controller: true })
    const ctrl = setupSWUpdate(env.win, env.nav)
    await Promise.resolve()
    ctrl?.dispose()
    const before = env.update.mock.calls.length
    env.fireDoc("visibilitychange")
    env.fireSW("controllerchange")
    await Promise.resolve()
    expect(env.update.mock.calls.length).toBe(before)
    expect(env.win.location.reload as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()
  })

  it("更新检查失败（离线/权限）静默处理，不抛错", async () => {
    const env = makeEnv()
    ;(env.nav.serviceWorker.getRegistration as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("offline")
    )
    const ctrl = setupSWUpdate(env.win, env.nav)
    for (let i = 0; i < 5; i++) await Promise.resolve()
    ctrl?.dispose()
    expect(true).toBe(true)
  })

  it("默认检查间隔为 30 分钟", () => {
    expect(UPDATE_INTERVAL_MS).toBe(30 * 60 * 1000)
  })
})
