/**
 * useCoarsePointer：是否为「触摸为主」的设备（finger == coarse）
 *
 * 用途：列表入场错峰在移动端要更紧凑（长列表 + 更强的即时反馈预期），
 * 桌面端可以更松弛。用 matchMedia 而非 UA 嗅探，保证 SSR / 测试环境安全。
 *
 * 与 prefers-reduced-motion 一样属于「跟随系统偏好」的一次性判断，
 * 无需监听变化，因此只在挂载时读取一次。
 */

import { useEffect, useState } from "react"

const QUERY = "(hover: none) and (pointer: coarse)"

export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    setCoarse(window.matchMedia(QUERY).matches)
  }, [])

  return coarse
}

export default useCoarsePointer
