/**
 * 设置 · 外观：system / light / dark 主题。
 */

import { useApp } from "@/hooks/useApp"
import { Monitor, Moon, Sun } from "@/components/ui"
import { Section } from "./Section"
import type { ThemeMode } from "@cloudclipboard/types"

const THEMES: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { value: "system", label: "跟随系统", icon: <Monitor className="w-4 h-4" /> },
  { value: "light", label: "浅色", icon: <Sun className="w-4 h-4" /> },
  { value: "dark", label: "深色", icon: <Moon className="w-4 h-4" /> },
]

export function AppearanceSection() {
  const { config, setTheme, isConfigured } = useApp()

  return (
    <Section title="外观" icon={<Sun className="w-3.5 h-3.5" />}>
      <div className="px-4 py-3 flex flex-wrap items-center gap-2">
        {THEMES.map((t) => (
          <button
            key={t.value}
            onClick={() => setTheme(t.value)}
            className={`flex-1 basis-24 min-w-0 flex items-center justify-center gap-2 px-3 py-3 rounded-xl border text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
              config.theme === t.value
                ? "border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--accent)]"
                : "border-[var(--hairline)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      <p className="px-4 pb-3 text-[10px] text-[var(--text-tertiary)]">
        {isConfigured
          ? "主题会同步到你的所有设备（切换后其他设备 30 秒内自动生效）。"
          : "连接后，主题偏好将跨设备同步。"}
      </p>
    </Section>
  )
}
