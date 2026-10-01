/**
 * 轻量 QR Code（canvas 绘制，高分屏清晰）
 * 颜色读取 CSS 变量，主题切换（data-theme 变化）时自动重绘。
 */

import { useEffect, useRef } from "react"
import qrcode from "qrcode-generator"

export function QRCodeCanvas({ value, size = 160 }: { value: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const qr = qrcode(0, "M")
    qr.addData(value)
    qr.make()
    const count = qr.getModuleCount()

    const draw = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = size * dpr
      canvas.height = size * dpr
      canvas.style.width = `${size}px`
      canvas.style.height = `${size}px`
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      // 从 CSS 变量读取颜色，跟随当前主题（浅色/深色）
      const cs = getComputedStyle(document.documentElement)
      const bg = cs.getPropertyValue("--bg-surface-solid").trim() || "#ffffff"
      const fg = cs.getPropertyValue("--text-primary").trim() || "#1d1d1f"

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, size, size)
      ctx.fillStyle = fg
      const cell = size / count
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (qr.isDark(r, c)) {
            ctx.fillRect(c * cell, r * cell, cell * 0.92, cell * 0.92)
          }
        }
      }
    }

    draw()
    // 主题通过 <html data-theme> 切换：监听属性变化重绘
    const observer = new MutationObserver(draw)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
    return () => observer.disconnect()
  }, [value, size])

  return <canvas ref={canvasRef} className="rounded-[var(--radius-md)]" />
}
