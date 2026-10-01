/**
 * 行内消息条：error / success / info 三态。
 */

import type { ReactNode } from "react"

type Tone = "error" | "success" | "info"

const TONE_CLASS: Record<Tone, string> = {
  error: "inline-message--error",
  success: "inline-message--success",
  info: "inline-message--info",
}

export function InlineMessage({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  return <p className={`inline-message ${TONE_CLASS[tone]}`}>{children}</p>
}
