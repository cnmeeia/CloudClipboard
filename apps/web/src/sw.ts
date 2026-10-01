/// <reference lib="webworker" />
/// <reference types="vite-plugin-pwa/client" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching"
import { registerRoute, NavigationRoute } from "workbox-routing"
import { NetworkFirst, StaleWhileRevalidate } from "workbox-strategies"

declare let self: ServiceWorkerGlobalScope

// ──────────────────────────────
// 立即接管（配合 registerType: "autoUpdate"）
// - self.skipWaiting()：SW 安装后立即激活，不等旧页面全部关闭
// - clients.claim()：激活后立即控制当前已打开的页面
// 解决 iOS PWA 上"代码已合并/部署，但用户仍看到旧版"的更新滞后问题
// ──────────────────────────────
self.skipWaiting()
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // 显式删除历史运行时缓存（旧版可能已被 Access 登录页污染）。
    const keys = await caches.keys()
    await Promise.all(
      keys
        .filter((k) => k === "cloudclip-shell" || k === "cloudclip-assets")
        .map((k) => caches.delete(k))
    )
    await self.clients.claim()
  })())
})

// 缓存版本：一旦旧缓存被污染（如误存 Access 登录页），升版本即可整体废弃。
const SHELL_CACHE = "cloudclip-shell-v2"
const ASSET_CACHE = "cloudclip-assets-v2"

// 只允许"成功且类型正确"的响应写入缓存。
// 关键修复：Cloudflare Access 会话过期时，/assets/*.css、*.js 会被重定向到
// 登录页并返回 200 text/html；若把它缓存，PWA 会持续把 HTML 当 CSS/JS 使用，
// 表现为整页无样式、链接变默认蓝色（见 IMG_2418）。
const cacheableAsset = {
  cacheWillUpdate: async ({ response }: { response: Response }) => {
    if (response.status !== 200 || response.type === "opaque") return null
    const ct = response.headers.get("content-type") || ""
    if (ct.includes("text/html")) return null
    return response
  },
}

const cacheableNavigation = {
  cacheWillUpdate: async ({ response }: { response: Response }) => {
    // 只缓存真正的应用壳 HTML；Access 登录页/错误页绝不进缓存
    if (response.status !== 200 || response.type === "opaque") return null
    const ct = response.headers.get("content-type") || ""
    return ct.includes("text/html") ? response : null
  },
}

// ──────────────────────────────
// 支持「用户点击刷新后立即生效」
// 页面侧（lib/swUpdate.ts）在用户确认后 postMessage({type:"SKIP_WAITING"})，
// 这里显式响应，兼容浏览器未自动跳过等待态的情况，确保新版本能立刻接管。
// ──────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting()
})

// ──────────────────────────────
// 路由注册顺序很重要！
// 必须先注册 NavigationRoute（NetworkFirst），再注册 precacheAndRoute，
// 因为 Workbox 按注册顺序匹配路由。若 precache 先注册，
// 导航请求会直接命中 precache 缓存返回旧版 index.html，
// 导致部署新代码后 PWA 仍显示旧页面（iOS standalone 常见问题）。
// ──────────────────────────────

// 导航请求 → NetworkFirst（网络优先，网络恢复后更新 HTML 壳）
registerRoute(
  new NavigationRoute(new NetworkFirst({
    cacheName: SHELL_CACHE,
    networkTimeoutSeconds: 3,
    plugins: [cacheableNavigation],
  }))
)

// 静态资源 → StaleWhileRevalidate（带内容哈希的文件名天然可回源校验，
// 既能秒开旧缓存，又会在后台拉取新版本，避免长期停留在旧版导致"改了没生效"）
registerRoute(
  ({ request }) =>
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "image" ||
    request.destination === "font",
  new StaleWhileRevalidate({
    cacheName: ASSET_CACHE,
    plugins: [cacheableAsset],
  })
)

// ──────────────────────────────
// PWA 预缓存 + 离线壳（§53/§54）
// 必须在 NavigationRoute 之后注册，避免抢占导航请求
// ──────────────────────────────
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

export {}
