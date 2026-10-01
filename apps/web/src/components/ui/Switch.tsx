/**
 * 语义开关（iOS 风格），受控。
 */

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  "aria-label"?: string
}

export function Switch({ checked, onChange, disabled, ...rest }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={rest["aria-label"]}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`switch ${checked ? "switch--on" : ""}`}
    >
      <span className="switch__knob" />
    </button>
  )
}
