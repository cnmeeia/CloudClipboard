/**
 * Reveal（§88 动画落地 · Great UI 引入）
 *
 * 滚动进入视口时触发的入场动画（淡入 + 上移 + 可选缩放），
 * 仅使用本项目 design tokens（CSS 变量），不影响整体 UI 颜色。
 *
 * 特性：
 * - 基于 framer-motion 的 whileInView，滚动到视口内自动触发
 * - 支持 stagger 错峰：父级给 index，子级按顺序入场
 * - 默认位移走物理弹簧（spring cascade），收尾自然、回弹极弱；
 *   透明度走短缓动。可用 ease prop 显式切回缓动（长距离 / 页面级大位移更合适）
 * - 尊重系统 prefers-reduced-motion：降级为纯淡入、无位移、无错峰
 * - 不引入任何硬编码颜色，全部继承现有配色
 */

import { motion, useReducedMotion } from "framer-motion"
import type { ReactNode } from "react"
import {
  EASE_OUT,
  DUR_REVEAL,
  STAGGER_REVEAL,
  ENTER_DISTANCE,
  SPRING_FADE,
  springTransition,
} from "@/lib/motion"

export interface RevealProps {
  children: ReactNode
  /** 错峰索引：同一容器内多个元素从 0 递增可实现依次入场 */
  index?: number
  /** 入场方向：up / down / left / right / none */
  direction?: "up" | "down" | "left" | "right" | "none"
  /** 单个元素动画时长（s） */
  duration?: number
  /** 错峰间隔（s） */
  delayStep?: number
  /** 距离（px） */
  distance?: number
  /** 初始缩放 */
  scale?: number
  /**
   * 是否使用物理弹簧（默认 true）。
   * 小位移（±14px）用 spring 手感最自然；大位移 / 页面级入场建议 false 走缓动。
   */
  spring?: boolean
  className?: string
}

export function Reveal({
  children,
  index = 0,
  direction = "up",
  duration = DUR_REVEAL,
  delayStep = STAGGER_REVEAL,
  distance = ENTER_DISTANCE,
  scale = 1,
  spring = true,
  className,
}: RevealProps) {
  const reduce = useReducedMotion()

  const offset =
    direction === "up"
      ? { y: distance }
      : direction === "down"
        ? { y: -distance }
        : direction === "left"
          ? { x: distance }
          : direction === "right"
            ? { x: -distance }
            : {}

  const delay = reduce ? 0 : index * delayStep

  return (
    <motion.div
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, ...offset, scale }}
      whileInView={reduce ? { opacity: 1 } : { opacity: 1, x: 0, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={
        reduce
          ? { duration: SPRING_FADE }
          : spring
            ? { ...springTransition(duration, delay), opacity: { duration: SPRING_FADE, delay } }
            : { duration, delay, ease: EASE_OUT }
      }
    >
      {children}
    </motion.div>
  )
}

export default Reveal
