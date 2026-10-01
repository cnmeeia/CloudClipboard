/**
 * TTLPicker：剪贴板有效期选择器（§ 推荐组件落地）
 *
 * 设计约定（Issue #83）：
 * - 有效期必须由用户在前端显式选择，不做隐式默认
 * - 未选择时「同步」按钮禁用，并提示先选择有效期
 * - 选择「永久」= 真正永不过期（服务端 expires_at = NULL），不会被后台清理
 * - 选择时长后，卡片/详情页展示过期时间与剩余时间，到期即销毁
 *
 * 返回值单位为「秒」，null 表示永久；对接 ClipboardItemCreateInput.expires_in。
 */

import { Clock, X } from "@/components/ui"

export interface TTLValue {
  /** 秒；null 表示永久 */
  seconds: number | null
  label: string
}

export const TTL_OPTIONS: TTLValue[] = [
  { seconds: null, label: "永久" },
  { seconds: 30 * 60, label: "30 分钟" },
  { seconds: 60 * 60, label: "1 小时" },
  { seconds: 24 * 60 * 60, label: "1 天" },
  { seconds: 7 * 24 * 60 * 60, label: "7 天" },
]

interface Props {
  /** 未选择时为 null（不传 value 的秒数语义另用 selected 区分） */
  value: TTLValue | null
  selected: boolean
  onChange: (v: TTLValue) => void
}

export function TTLPicker({ value, selected, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
      <Clock className="w-3 h-3 shrink-0" />
      <span className="whitespace-nowrap">
        有效期
        {!selected && <span className="text-[var(--error)]">（必选）</span>}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        {TTL_OPTIONS.map((opt) => {
          const active = selected && value != null && opt.seconds === value.seconds
          return (
            <button
              key={opt.label}
              onClick={() => onChange(opt)}
              aria-pressed={active}
              className={`px-2 py-1 rounded-lg border whitespace-nowrap transition-all cursor-pointer ${
                active
                  ? "bg-[var(--accent-tint)] text-[var(--accent)] border-[var(--accent-border)]"
                  : "border-[var(--hairline)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
      {selected && value && value.seconds !== null && (
        <span className="text-[var(--accent)] flex items-center gap-1">
          {value.label}
          <button
            onClick={() => onChange(TTL_OPTIONS[0])}
            title="改为永久保存" aria-label="改为永久保存"
            className="p-1 rounded hover:bg-[var(--accent-tint)] cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      )}
      {selected && value && value.seconds === null && (
        <span className="text-[var(--accent)] flex items-center gap-1">
          永久保存，不会被自动清理
        </span>
      )}
    </div>
  )
}
