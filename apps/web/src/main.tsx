import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router"
import { App } from "./App"
import { requestPersistentStorage } from "@cloudclipboard/crypto"
import { setupSWUpdate } from "./lib/swUpdate"
import { setUpdateApplier } from "./lib/swUpdateStore"
import "./index.css"

// 请求持久化存储：防止 iOS/Safari 在存储压力下清除 IndexedDB
// （master key 存在 IndexedDB，被清除会导致所有历史密文无法解密）
void requestPersistentStorage()

// ──────────────────────────────
// PWA 更新管理（Issue #86 后续：修复"部署了但用户仍是旧版"）
//
// 旧实现只在 controllerchange 时无条件 reload，导致：
// - 一次冷启动 reload 2~3 次（skipWaiting + clients.claim 多次触发）
// - 用户正在输入/粘贴时被强制刷新，内容被清空
// 且**没有任何主动更新检查**，iOS PWA 从后台恢复时没有导航，
// 浏览器不会自动检查 SW 更新 → 用户长期停留在旧 bundle。
//
// 现在：主动检查更新 + 只提示不强制刷新（见 UpdatePrompt）+ 幂等 reload。
// ──────────────────────────────
const swUpdate = setupSWUpdate(window, navigator)
if (swUpdate) {
  setUpdateApplier(() => swUpdate.applyUpdate())
}

const root = document.getElementById("root")
if (!root) throw new Error("Root element not found")

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)
