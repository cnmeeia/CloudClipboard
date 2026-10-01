/**
 * BlurReveal（§88 动画落地 · 由 Great UI BlurScrollReveal 改编）
 *
 * 滚动进入视口时，文字从「模糊 → 清晰」逐词揭示。
 * 仅做 opacity / blur / transform 变换，完全继承现有文字颜色，
 * 不影响整体 UI 配色。
 *
 * 使用 framer-motion 的 whileInView，适配项目 design tokens。
 */

import { motion, useReducedMotion } from "framer-motion"
import type { ReactNode } from "react"
import { EASE_OUT, DUR_REVEAL, SPRING_FADE, springTransition } from "@/lib/motion"

export interface BlurRevealProps {
  text: string
  /** word：逐词揭示；line：整句一次性揭示 */
  variant?: "word" | "line"
  className?: string
  /** 错峰间隔（s） */
  stagger?: number
}

export function BlurReveal({
  text,
  variant = "line",
  className,
  stagger = 0.04,
}: BlurRevealProps) {
  const reduce = useReducedMotion()

  const words = text.split(" ").filter(Boolean)

  const reveal = {
    hidden: { opacity: 0, filter: reduce ? "blur(0px)" : "blur(10px)", y: reduce ? 0 : 8 },
    visible: { opacity: 1, filter: "blur(0px)", y: 0 },
  }

  // 「模糊 → 清晰」由 filter 驱动，必须用缓动（spring 无法正确插值 blur）。
  // 逐词揭示时每个词按 stagger 递增延迟，形成字幕式 cascade。
  const wordTransition = (delay: number) =>
    reduce
      ? { duration: SPRING_FADE }
      : {
          ...springTransition(DUR_REVEAL, delay),
          type: undefined,
          ease: EASE_OUT,
          filter: { duration: DUR_REVEAL, delay, ease: EASE_OUT },
        }

  return (
    <motion.span
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-30px" }}
      transition={wordTransition(0)}
      aria-label={text}
    >
      {variant === "word"
        ? words.map((word, i) => (
            <motion.span
              key={i}
              className="inline-block"
              initial={reveal.hidden}
              whileInView={reveal.visible}
              viewport={{ once: true, margin: "-30px" }}
              transition={wordTransition(reduce ? 0 : i * stagger)}
            >
              {word}
              {i < words.length - 1 ? "\u00A0" : ""}
            </motion.span>
          ))
        : words.join(" ")}
    </motion.span>
  )
}

export default BlurReveal
