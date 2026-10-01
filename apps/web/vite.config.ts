import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { VitePWA } from "vite-plugin-pwa"
import tailwindcss from "@tailwindcss/vite"
import path from "path"

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "CloudClipboard",
        short_name: "Clipboard",
        description: "Your private clipboard, everywhere. · PWA + E2EE",
        theme_color: "#000000",
        background_color: "#000000",
        display: "standalone",
        scope: "/",
        start_url: "/",
        orientation: "any",
        lang: "zh-CN",
        categories: ["productivity", "utilities"],
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" }
        ],
        shortcuts: [
          {
            name: "新剪贴板",
            short_name: "新建",
            description: "快速创建剪贴板条目",
            url: "/clipboard",
            icons: [{ src: "/icon-192.png", sizes: "192x192" }]
          },
          {
            name: "设备管理",
            short_name: "设备",
            description: "管理已连接的设备",
            url: "/devices",
            icons: [{ src: "/icon-192.png", sizes: "192x192" }]
          }
        ]
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
      },
      devOptions: {
        enabled: true,
        type: "module"
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@components": path.resolve(__dirname, "./src/components"),
      "@pages": path.resolve(__dirname, "./src/pages"),
      "@lib": path.resolve(__dirname, "./src/lib"),
      "@hooks": path.resolve(__dirname, "./src/hooks"),
      "@clipboard": path.resolve(__dirname, "./src/clipboard"),
      "@devices": path.resolve(__dirname, "./src/devices"),
      "@crypto": path.resolve(__dirname, "./src/crypto"),
      "@storage": path.resolve(__dirname, "./src/storage"),
      "@types": path.resolve(__dirname, "./src/types")
    }
  },
  build: {
    target: "es2022",
    minify: "esbuild",
    sourcemap: false,
    chunkSizeWarningLimit: 1500
  }
})
