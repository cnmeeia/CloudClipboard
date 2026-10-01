/**
 * CardStagger：列表卡片 Stagger Delay + Spring Cascade（统一动画 · A3）
 *
 * 剪贴板列表 / 最近内容等长列表的卡片入场统一走这里：
 * - 首次挂载时按 index 错峰（STAGGER）淡入 + 向上滑入，形成交错瀑布
 * - 位移由物理弹簧驱动（Spring Cascade）：收尾自然、带极弱回弹，不做持续弹跳
 *   透明度仍走短缓动（spring 不适合驱动 opacity）
 * - 索引封顶（STAGGER_CAP_LIST）：长列表不会因逐卡延迟而入场过慢
 * - 触摸设备错峰更紧凑（STAGGER_TOUCH），避免下方卡片"迟到"像卡顿
 * - 数据刷新（30s 轮询）时 key 不变不重播；新条目 key 变化自动补播
 * - 尊重 prefers-reduced-motion：降级为纯淡入、无位移、无错峰
 *
 * 布局加固（Issue #41）：
 * - `min-w-0`：作为 grid 项时允许卡片收缩，避免内部超宽内容（长代码 / 无空格长文本）
 *   把 grid 列撑开，导致 RichCard 卡片溢出容器宽度（iPad PWA UI 溢出）。
 * - `w-full`：占满 grid 轨道，卡片宽度对齐容器。
 */

import { motion, useReducedMotion } from "framer-motion"
import type { ReactNode } from "react"
import { useCoarsePointer } from "@/hooks/useCoarsePointer"
import {
  DUR_CARD,
  ENTER_DISTANCE,
  SPRING_FADE,
  STAGGER,
  STAGGER_CAP_LIST,
  STAGGER_TOUCH,
  springTransition,
} from "@/lib/motion"

interface CardStaggerProps {
  children: ReactNode
  /** 错峰索引，从 0 递增 */
  index: number
  className?: string
}

export function CardStagger({ children, index, className }: CardStaggerProps) {
  const reduce = useReducedMotion()
  const coarse = useCoarsePointer()

  // 索引封顶：延迟上限 = 8 * 0.05 = 400ms，之后所有卡片同批入场
  const delay = Math.min(index, STAGGER_CAP_LIST) * (coarse ? STAGGER_TOUCH : STAGGER)

  if (reduce) {
    return (
      <motion.div
        className={`min-w-0 w-full ${className ?? ""}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: SPRING_FADE }}
      >
        {children}
      </motion.div>
    )
  }

  return (
    <motion.div
      className={`min-w-0 w-full ${className ?? ""}`}
      initial={{ opacity: 0, y: ENTER_DISTANCE }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springTransition(DUR_CARD, delay), opacity: { duration: SPRING_FADE, delay } }}
    >
      {children}
    </motion.div>
  )
}

export default CardStagger
