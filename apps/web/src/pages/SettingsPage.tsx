/**
 * 设置页：连接 / 外观 / 安全 / API Token / 存储 / 关于
 * 各区块见 components/settings/。
 */

import { ConnectionSection } from "@/components/settings/ConnectionSection"
import { AppearanceSection } from "@/components/settings/AppearanceSection"
import { MasterKeySection } from "@/components/settings/MasterKeySection"
import { ApiTokenSection } from "@/components/settings/ApiTokenSection"
import { StorageSection, AboutSection } from "@/components/settings/AboutSection"

export function SettingsPage() {
  return (
    <div className="max-w-2xl space-y-4">
      <ConnectionSection />
      <AppearanceSection />
      <MasterKeySection />
      <ApiTokenSection />
      <StorageSection />
      <AboutSection />
    </div>
  )
}
