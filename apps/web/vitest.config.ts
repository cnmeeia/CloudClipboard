import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  resolve: {
    // 与 vite.config.ts 保持一致的别名。
    // 之前缺失该配置 → 任何 import "@/..." 的**组件级测试**都无法运行，
    // 导致 Issue #86 这类只存在于组件交互里的回归（onPaste 重复插入）
    // 无法被测试覆盖，只能靠人工推理。
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.tsx", "tests/**/*.test.ts"],
  },
})
