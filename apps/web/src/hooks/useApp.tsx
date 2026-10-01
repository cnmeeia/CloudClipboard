/**
 * 应用全局状态（React Context）
 * 管理：配置、剪贴板、设备、推送状态
 *
 * 认证：Cloudflare Zero Trust（Access）。无需管理 token / 配对 / OTP，
 * 浏览器访问 Worker 时自动携带 Access JWT。设备身份由本地持久化的
 * deviceId（localStorage）标识，应用升级后保持不变 → 数据不丢失。
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react"
import type { AppConfig, ClipboardItem, Device, NotificationPrefs, ThemeMode } from "@cloudclipboard/types"
import { ApiClient, ApiError, SESSION_EXPIRED } from "@/lib/api"
import { findDuplicateListItem } from "@/lib/content"
import {
  loadConfig,
  saveConfig,
  loadPins,
  savePins,
  loadNotificationPrefs,
  saveNotificationPrefs,
} from "@/storage"
import { CLIPBOARD_POLL_INTERVAL_MS } from "@cloudclipboard/shared"

interface AppState {
  config: AppConfig
  deviceId: string
  /** 当前用户 ID（来自 /api/me，用于种子短语派生 salt） */
  userId: string
  items: ClipboardItem[]
  devices: Device[]
  pins: string[]
  notificationPrefs: NotificationPrefs
  isConfigured: boolean
  loading: boolean
  /** 后台静默同步中（定时轮询/切回前台）：不触发骨架与状态文案闪烁 */
  syncing: boolean
  /** 最近一次列表同步是否失败（网络错误等；会话过期不算，另有覆盖层） */
  syncFailed: boolean
  /** 会话是否已过期（Access 登录失效），true 时全局弹出重登覆盖层 */
  sessionExpired: boolean
  /** 清除会话过期状态（重登 / 探活恢复成功后调用） */
  clearSessionExpired: () => void
  setTheme: (t: ThemeMode) => void
  setWorkerUrl: (url: string) => void
  setNotificationPrefs: (prefs: Partial<NotificationPrefs>) => void
  renameDevice: (name: string) => Promise<void>
  /** 刷新剪贴板列表。background=true 时静默执行（轮询/可见性恢复），不切换 loading */
  refreshList: (opts?: { background?: boolean }) => Promise<void>
  refreshDevices: () => Promise<void>
  refreshAll: () => void
  pushClipboard: (content: string, type: ClipboardItem["type"], expiresIn?: number) => Promise<boolean>
  deleteItem: (id: string) => Promise<void>
  togglePin: (id: string) => void
  api: ApiClient
}

const Ctx = createContext<AppState | null>(null)

export function useApp(): AppState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useApp must be used within AppProvider")
  return ctx
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(() => loadConfig())
  const [items, setItems] = useState<ClipboardItem[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [pins, setPins] = useState<string[]>(() => loadPins())
  // 初始即为 true：已配置用户进入时首屏先显示骨架，避免「空状态闪一帧再出内容」
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncFailed, setSyncFailed] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [userId, setUserId] = useState<string>("")
  const [notificationPrefs, setNotificationPrefsState] = useState<NotificationPrefs>(loadNotificationPrefs)

  const deviceId = config.deviceId

  const api = useMemo(
    () => new ApiClient(() => config.workerUrl, () => config.deviceId, () => config.deviceName),
    [config.workerUrl, config.deviceId, config.deviceName]
  )

  // 已配置 = 已设置 Worker 地址（Cloudflare Access 负责认证）
  const isConfigured = !!config.workerUrl.trim()

  // 应用主题（system/light/dark）
  useEffect(() => {
    const apply = () => {
      const resolved =
        config.theme === "system"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : config.theme
      document.documentElement.dataset.theme = resolved
      // 同步 system 状态栏颜色（PWA standalone 模式下顶部状态栏与页面主题保持一致）
      const cs = getComputedStyle(document.documentElement)
      const meta = document.querySelector('meta[name="theme-color"]')
      if (meta) {
        meta.setAttribute("content", cs.getPropertyValue("--theme-color-meta").trim())
      }
    }
    apply()
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [config.theme])

  // 拉取云端用户偏好（主题），覆盖本地 → 跨设备同步
  // 规则：服务器为权威（last-writer-wins），本地 localStorage 仅作离线/未连接兜底
  const syncThemeFromServer = useCallback(async () => {
    if (!isConfigured) return
    try {
      const prefs = await api.fetchPrefs()
      setConfig((prev) => {
        if (prev.theme === prefs.theme) return prev
        const next = { ...prev, theme: prefs.theme }
        saveConfig(next)
        return next
      })
      // 同步通知偏好（以服务端为准，覆盖本地旧值）
      const serverNotif = prefs.notification
      if (serverNotif) {
        setNotificationPrefsState(serverNotif)
        saveNotificationPrefs(serverNotif)
      }
    } catch (e) {
      // 会话过期统一处理；网络失败静默（下次轮询/切回前台时再试）
      if (e instanceof ApiError && e.code === SESSION_EXPIRED) setSessionExpired(true)
    }
  }, [api, isConfigured])

  const setTheme = useCallback((t: ThemeMode) => {
    setConfig((prev) => {
      const next = { ...prev, theme: t }
      saveConfig(next)
      return next
    })
    // 推送到云端（跨设备同步）。失败不阻塞本地生效，会话过期仍需提示重登
    if (isConfigured) {
      api.updateTheme(t).catch((e) => {
        if (e instanceof ApiError && e.code === SESSION_EXPIRED) setSessionExpired(true)
      })
    }
  }, [api, isConfigured])

  const setWorkerUrl = useCallback((url: string) => {
    setConfig((prev) => {
      const next = { ...prev, workerUrl: url.trim() }
      saveConfig(next)
      return next
    })
  }, [])

  const setNotificationPrefs = useCallback((prefs: Partial<NotificationPrefs>) => {
    setNotificationPrefsState((prev) => {
      const next = { ...prev, ...prefs }
      saveNotificationPrefs(next)
      return next
    })
    // 同步到云端（跨设备生效）
    if (isConfigured) {
      api.updateNotificationPrefs(prefs).catch((e) => {
        if (e instanceof ApiError && e.code === SESSION_EXPIRED) setSessionExpired(true)
      })
    }
  }, [api, isConfigured])

  // 统一错误处理：识别会话过期并切换全局状态
  const handleError = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.code === SESSION_EXPIRED) {
      setSessionExpired(true)
      return true
    }
    return false
  }, [])

  const clearSessionExpired = useCallback(() => setSessionExpired(false), [])

  // 进行中的列表请求：provider 首次加载与页面挂载刷新可能同时触发，
  // 合并为同一次网络请求，避免冷启动重复拉取。
  const inflightList = useRef<Promise<void> | null>(null)

  // 设备列表刷新前先注册当前设备（upsert），确保设备始终出现在列表中
  // 注册逻辑合并到 refreshDevices 中，避免重复注册
  const refreshList = useCallback(
    (opts?: { background?: boolean }) => {
      // 已有进行中的请求则直接复用（无论前台/后台，首个调用方决定 UI 模式）
      if (inflightList.current) return inflightList.current
      if (!isConfigured) {
        setLoading(false)
        return Promise.resolve()
      }
      // 后台同步只置 syncing，不切换 loading，避免列表/指示器周期性闪烁
      if (opts?.background) {
        setSyncing(true)
      } else {
        setLoading(true)
      }
      const run = (async () => {
        try {
          // 拉取最新 CLIPBOARD_LIST_LIMIT 条（默认值）；UI 会提示这只是最新一页
          const data = await api.fetchClipboardList()
          setItems(data)
          setSyncFailed(false)
        } catch (e) {
          // 会话过期交给 handleError 统一切换；其他错误（断网/5xx）标记同步失败，
          // 由 SyncIndicator 如实显示"同步失败，点击重试"，不再伪装成"已同步"。
          const isSession = handleError(e)
          if (!isSession) setSyncFailed(true)
        } finally {
          setLoading(false)
          setSyncing(false)
          inflightList.current = null
        }
      })()
      inflightList.current = run
      return run
    },
    [api, isConfigured, handleError]
  )

  const refreshDevices = useCallback(async () => {
    if (!isConfigured) return
    // 先注册当前设备（upsert）。失败不再静默吞掉：注册失败会直接导致
    // "本机不显示 / 跨设备数据丢失"，打到控制台便于定位。
    try {
      await api.registerDevice(config.deviceId, config.deviceName)
    } catch (e) {
      console.error("[CloudClipboard] registerDevice 失败：", e)
      handleError(e)
    }
    try {
      const data = await api.fetchDevices()
      setDevices(data)
    } catch (e) {
      handleError(e)
    }
  }, [api, isConfigured, config.deviceId, config.deviceName, handleError])

  // 获取当前用户身份（userId 用于 PBKDF2 派生 salt）
  const fetchUserId = useCallback(async () => {
    if (!isConfigured || userId) return
    try {
      const data = await api.fetchMe()
      if (data.user?.id) {
        setUserId(data.user.id)
      }
    } catch {
      // 获取 userId 失败不影响其他功能
    }
  }, [api, isConfigured, userId])

  // 连接后立即加载首页列表（终结初始骨架）、注册设备、获取 userId、应用云端主题。
  // 由 provider 统一负责首次加载：任何路由（含设置/设备/通知页）都不会卡在 loading，
  // 页面组件也不必各自在挂载时重复请求。
  useEffect(() => {
    if (!isConfigured) {
      setLoading(false)
      return
    }
    refreshList()
    refreshDevices()
    fetchUserId()
    syncThemeFromServer()
    // 仅在连接（workerUrl/deviceId）建立或变化时触发；重命名设备不应回退列表骨架
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured, config.workerUrl, config.deviceId])

  // 与 refreshDevices 保持引用稳定：全局同步 effect 依赖它
  const refreshAll = useCallback(() => {
    refreshList()
    refreshDevices()
  }, [refreshList, refreshDevices])

  // 全局自动同步（§54）：页面可见时 + 定时轮询 + SW 推送消息 → 刷新列表/设备/主题
  useEffect(() => {
    if (!isConfigured) return
    const sync = () => {
      refreshList({ background: true })
      refreshDevices()
      syncThemeFromServer()
    }
    // 定时轮询：设备在线窗口 5 分钟，轮询 30s 足够及时
    const timer = setInterval(sync, CLIPBOARD_POLL_INTERVAL_MS)
    // 页面从后台切回时立即同步
    const onVisibility = () => {
      if (document.visibilityState === "visible") sync()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [isConfigured, refreshList, refreshDevices, syncThemeFromServer])

  // 重命名当前设备（并持久化）
  const renameDevice = useCallback(
    async (name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      setConfig((prev) => {
        const next = { ...prev, deviceName: trimmed }
        saveConfig(next)
        return next
      })
      try {
        await api.renameDevice(config.deviceId, trimmed)
      } catch (e) {
        // 名称持久化到本地，服务端同步失败可稍后重试
        handleError(e)
      }
    },
    [api, config.deviceId, handleError]
  )

  const pushClipboard = useCallback(async (content: string, type: ClipboardItem["type"], expiresIn?: number) => {
    if (!isConfigured) return false
    // 调用方负责 E2EE 加密；此处通过 api 直接上传密文
    const { encryptClipboardContent, getMasterKey } = await import("@cloudclipboard/crypto")
    const masterKey = await getMasterKey()
    if (!masterKey) {
      throw new Error("NO_MASTER_KEY")
    }
    const { encrypted, iv, wrappedKey, salt } = await encryptClipboardContent(content, masterKey)
    const item = await api.pushClipboard({
      type,
      encrypted_data: encrypted,
      iv,
      salt,
      wrapped_key: wrappedKey,
      expires_in: expiresIn ?? null,
    })
    // 乐观更新前先查重（Issue #86「双重粘贴直接两次」）：
    // 服务端 POST 不是幂等的，网络重试 / 双击同步 / ⌘↵ 连按两下都会真的落库两条，
    // 前端再 [item, ...prev] 叠一次，列表里就出现两张一模一样的卡片。
    // 命中重复时不再新增卡片，只把本地那条替换成服务端最新记录（id/created_at 以服务端为准）。
    setItems((prev) => {
      const dupAt = findDuplicateListItem(prev, item, content)
      if (dupAt === -1) return [item, ...prev]
      const next = [...prev]
      next[dupAt] = item
      return next
    })
    return true
  }, [api, isConfigured])

  const deleteItem = useCallback(async (id: string) => {
    try {
      await api.deleteClipboard(id)
    } catch (e) {
      handleError(e)
      throw e
    }
    setItems((prev) => prev.filter((i) => i.id !== id))
    setPins((prev) => {
      const next = prev.filter((p) => p !== id)
      savePins(next)
      return next
    })
  }, [api, handleError])

  const togglePin = useCallback((id: string) => {
    setPins((prev) => {
      const next = prev.includes(id) ? prev.filter((p) => p !== id) : [id, ...prev]
      savePins(next)
      return next
    })
  }, [])

  // Context value 稳定化：轮询刷新会高频切换 items / loading 等状态，
  // 未 memo 会导致所有消费者（含与本次更新无关的组件）拿到新对象并重渲染，
  // 是界面偶发闪烁的来源之一。依赖不变时保持同一引用。
  const value: AppState = useMemo(
    () => ({
      config,
      deviceId,
      userId,
      items,
      devices,
      pins,
      isConfigured,
      notificationPrefs,
      loading,
      syncing,
      syncFailed,
      sessionExpired,
      clearSessionExpired,
      setTheme,
      setWorkerUrl,
      setNotificationPrefs,
      renameDevice,
      refreshList,
      refreshDevices,
      refreshAll,
      pushClipboard,
      deleteItem,
      togglePin,
      api,
    }),
    [
      config,
      deviceId,
      userId,
      items,
      devices,
      pins,
      isConfigured,
      notificationPrefs,
      loading,
      syncing,
      syncFailed,
      sessionExpired,
      clearSessionExpired,
      setTheme,
      setWorkerUrl,
      setNotificationPrefs,
      renameDevice,
      refreshList,
      refreshDevices,
      refreshAll,
      pushClipboard,
      deleteItem,
      togglePin,
      api,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
