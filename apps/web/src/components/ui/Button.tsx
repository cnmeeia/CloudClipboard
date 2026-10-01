/**
 * 语义按钮：primary / secondary / ghost / danger
 * 统一全站按钮样式，替代 HeroUI Button。
 */

import type { ButtonHTMLAttributes, ReactNode } from "react"

type Variant = "primary" | "secondary" | "ghost" | "danger"
type Size = "sm" | "md"

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  isDisabled?: boolean
  children: ReactNode
}

export function Button({
  variant = "primary",
  size = "md",
  isDisabled = false,
  className = "",
  disabled,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || isDisabled}
      className={`btn btn--${variant} btn--${size} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
