/**
 * CloudClipboard App Shell
 * 桌面 Sidebar + 移动底栏 + 路由 + 页面切换过渡 + 导航滑动指示器
 */

import { useEffect, useState } from "react"
import { Routes, Route, Navigate, NavLink, useLocation } from "react-router"
import { AnimatePresence, motion, MotionConfig } from "framer-motion"
import { AppProvider, useApp } from "@/hooks/useApp"
import {
  ClipboardList,
  Smartphone,
  Bell,
  Settings,
  Search,
  LayoutDashboard,
} from "@/components/ui"
import type { LucideIcon } from "lucide-react"
import { Onboarding } from "@/pages/Onboarding"
import { Dashboard } from "@/pages/Dashboard"
import { ClipboardPage } from "@/pages/ClipboardPage"
import { ClipboardDetail } from "@/pages/ClipboardDetail"
import { DevicesPage } from "@/pages/DevicesPage"
import { NotificationsPage } from "@/pages/NotificationsPage"
import { SettingsPage } from "@/pages/SettingsPage"
import { CommandPalette } from "@/components/CommandPalette"
import { SessionExpiredOverlay } from "@/components/SessionExpiredOverlay"
import { UpdatePrompt } from "@/components/UpdatePrompt"
import { SyncIndicator } from "@/components/SyncIndicator"
import { ToastProvider } from "@/components/Toast"
import { EASE_OUT, DUR_PAGE, ENTER_DISTANCE } from "@/lib/motion"
import { isPointerCoarse } from "@/lib/utils"

interface NavItem {
  path: string
  label: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { path: "/dashboard", label: "概览", icon: LayoutDashboard },
  { path: "/clipboard", label: "剪贴板", icon: ClipboardList },
  { path: "/devices", label: "设备", icon: Smartphone },
  { path: "/notifications", label: "通知", icon: Bell },
  { path: "/settings", label: "设置", icon: Settings },
]

/** 页面标题映射：路由 → 标题 */
const PAGE_TITLES: Record<string, string> = Object.fromEntries(
  NAV_ITEMS.map((i) => [i.path, i.label]),
)

/** 侧栏 / 底栏激活态滑动胶囊，桌面与移动分开 layoutId 避免跨树干扰 */
const PILL_ID_DESKTOP = "nav-pill-desktop"
const PILL_ID_MOBILE = "nav-pill-mobile"

function BrandLogo({ size = "md" }: { size?: "md" | "sm" }) {
  const box = size === "sm" ? "w-8 h-8" : "w-11 h-11"
  const icon = size === "sm" ? "w-4 h-4" : "w-5 h-5"
  const radius = size === "sm" ? "var(--radius-sm)" : "var(--radius-md)"
  return (
    <div
      className={`${box} flex items-center justify-center shadow-md shrink-0`}
      style={{ borderRadius: radius, background: "var(--brand-gradient)" }}
    >
      <svg
        className={`${icon} text-[var(--on-accent)]`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M17.5 19a4.5 4.5 0 0 0 0-9h-1.8A7 7 0 1 0 6 16.9" />
      </svg>
    </div>
  )
}

function NavPill({ layoutId }: { layoutId: string }) {
  return (
    <motion.span
      layoutId={layoutId}
      className="absolute inset-0 rounded-[var(--radius-md)] bg-[var(--accent-tint)] border border-[var(--accent-border)]"
      transition={{ type: "spring", stiffness: 500, damping: 38, mass: 0.9 }}
      aria-hidden
    />
  )
}

/** 侧栏导航项 */
function SidebarLink({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.path}
      className={({ isActive }) =>
        `relative flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] text-[13px] font-medium transition-colors cursor-pointer ${
          isActive ? "text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <NavPill layoutId={PILL_ID_DESKTOP} />}
          <span className="relative z-10 flex items-center gap-3">
            <Icon className="w-4 h-4" strokeWidth={isActive ? 2.2 : 1.8} />
            {item.label}
          </span>
        </>
      )}
    </NavLink>
  )
}

/** 移动底栏导航项 */
function MobileNavLink({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.path}
      className={({ isActive }) =>
        `relative flex flex-col items-center gap-1 px-3 py-2 rounded-[var(--radius-md)] transition-colors ${
          isActive ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <NavPill layoutId={PILL_ID_MOBILE} />}
          <span className="relative z-10 flex flex-col items-center gap-1">
            <Icon className="w-5 h-5" strokeWidth={isActive ? 2.2 : 1.8} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </span>
        </>
      )}
    </NavLink>
  )
}

function Shell() {
  const { isConfigured } = useApp()
  const location = useLocation()

  // ⌘K 打开命令面板
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        document.dispatchEvent(new CustomEvent("cloudclip:palette"))
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  // 路由切换时回到顶部
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  // 未配置 → 引导页
  if (!isConfigured) {
    return <Onboarding />
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-area">
        <div className="w-full max-w-lg md:max-w-2xl lg:max-w-3xl mx-auto">
          <TopBar>
            <SyncIndicator />
          </TopBar>
          <div className="flex-1 min-w-0">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: ENTER_DISTANCE }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -ENTER_DISTANCE / 2 }}
                transition={{ duration: DUR_PAGE, ease: EASE_OUT }}
              >
                <Routes location={location}>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/clipboard" element={<ClipboardPage />} />
                  <Route path="/clipboard/:id" element={<ClipboardDetail />} />
                  <Route path="/devices" element={<DevicesPage />} />
                  <Route path="/notifications" element={<NotificationsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* 移动端底部导航 */}
      <MobileNav />

      {/* ⌘K 命令面板 */}
      <CommandPalette />
    </div>
  )
}

function Sidebar() {
  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col glass my-3 ml-3 mr-0 rounded-[var(--radius-lg)] p-3 gap-1 sticky top-3 h-[calc(100dvh-24px)]">
      <div className="flex items-center gap-3 px-3 py-3">
        <BrandLogo size="sm" />
        <div className="min-w-0">
          <div className="text-[13px] font-bold tracking-tight">CloudClipboard</div>
          <div className="text-[10px] text-[var(--text-tertiary)] truncate">Personal Universal Clipboard</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1 mt-1">
        {NAV_ITEMS.map((item) => (
          <SidebarLink key={item.path} item={item} />
        ))}
      </nav>
    </aside>
  )
}

function TopBar({ children }: { children?: React.ReactNode }) {
  const location = useLocation()
  // 触屏设备搜索按钮简化为纯图标，避免挤压标题（iOS PWA 布局）
  const [isCoarse] = useState(isPointerCoarse)

  // 根据路由计算页面标题
  const pageTitle = location.pathname.startsWith("/clipboard/")
    ? "剪贴板详情"
    : PAGE_TITLES[location.pathname] || "CloudClipboard"

  return (
    <header className="flex items-center justify-between gap-2 mb-3">
      <div className="min-w-0 flex-1">
        <h1 className="text-lg font-bold tracking-tight truncate">{pageTitle}</h1>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {children}
        <button
          onClick={() => document.dispatchEvent(new CustomEvent("cloudclip:palette"))}
          title="搜索（⌘K）"
          aria-label="搜索"
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-[var(--radius-md)] text-xs text-[var(--text-secondary)] bg-[var(--bg-subtle)] border border-[var(--hairline)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Search className="w-4 h-4 shrink-0" />
          {!isCoarse && (
            <>
              <span className="whitespace-nowrap">搜索</span>
              <kbd className="hidden sm:inline-block px-2 py-1 rounded-[var(--radius-sm)] font-mono text-[10px] text-[var(--text-tertiary)] border border-[var(--hairline-strong)]">
                ⌘K
              </kbd>
            </>
          )}
        </button>
        <NavLink
          to="/settings"
          className="flex items-center justify-center w-9 h-9 rounded-[var(--radius-md)] bg-[var(--bg-subtle)] border border-[var(--hairline)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer shrink-0"
          aria-label="设置"
        >
          <Settings className="w-4 h-4" />
        </NavLink>
      </div>
    </header>
  )
}

function MobileNav() {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-[var(--z-nav)] glass-strong rounded-t-[var(--radius-lg)] px-2 pb-[env(safe-area-inset-bottom)] mobile-nav-bar">
      <div className="flex items-center justify-around py-2">
        {NAV_ITEMS.map((item) => (
          <MobileNavLink key={item.path} item={item} />
        ))}
      </div>
    </nav>
  )
}

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <AppProvider>
        <ToastProvider>
          <Shell />
          {/* 会话过期全局覆盖层：登录失效时阻断整页并引导重登 */}
          <SessionExpiredOverlay />
          {/* 新版本提示条：SW 检测到更新时提示，由用户决定何时刷新 */}
          <UpdatePrompt />
        </ToastProvider>
      </AppProvider>
    </MotionConfig>
  )
}
