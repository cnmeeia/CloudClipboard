/**
 * 加载指示器。onAccent 用于放在实心按钮内。
 */

export function Spinner({ size = 14, onAccent = false }: { size?: number; onAccent?: boolean }) {
  return (
    <span
      className={`spinner ${onAccent ? "spinner--on-accent" : ""}`}
      style={{ width: size, height: size, borderWidth: Math.max(2, Math.round(size / 7)) }}
      aria-hidden
    />
  )
}
