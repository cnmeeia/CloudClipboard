/**
 * 统一动效常量（§ 设计系统 · 统一动画）
 *
 * 所有 framer-motion 动画统一从这里取值，禁止在组件里硬编码
 * 时长 / 缓动 / 错峰间隔。与 index.css 的 --duration-* / --ease-* token 同源，
 * 保证 CSS 动画与 JS 动画节奏一致。
 *
 * Impeccable 设计准则（impeccable.style/slop）：
 * - 列表卡片入场（CardStagger spring cascade）使用「物理弹簧」：位移由 spring 驱动，
 *   收尾自然、带极弱回弹（bounce 极低），不做持续弹跳。
 * - 透明度 / 颜色 / 背景等非物理属性仍走 expo ease-out 缓动，不用 spring。
 * - 底部抽屉上滑（Issue #71 视觉稿）允许使用轻量 spring，振幅受控。
 */

/** 标准出缓动曲线（对应 --ease-out） */
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]
/** expo 出缓动曲线：比标准 ease-out 更快启动、更平缓收尾（对应 index.css --ease-expo） */
export const EASE_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1]
/** 快速（微交互，对应 --duration-fast） */
export const DUR_FAST = 0.16
/** 页面切换过渡时长 */
export const DUR_PAGE = 0.22
/** 卡片入场时长（列表错峰，Issue #71：220–280ms 淡入上移，取 260ms） */
export const DUR_CARD = 0.26
/** 底部抽屉上滑时长（Issue #71：280ms spring） */
export const DUR_SHEET = 0.28
/** 遮罩淡入时长（Issue #71：180ms） */
export const DUR_MASK = 0.18
/** 滚动揭示（Reveal / BlurReveal）时长 */
export const DUR_REVEAL = 0.5
/**
 * 列表错峰间隔（s）
 *
 * Stagger Delay：第 n 张卡片延迟 n * STAGGER 入场，形成瀑布式交错。
 * 移动端（触摸设备）取更小值——卡片列表更长、滚动更依赖即时反馈，
 * 过大的错峰会让屏幕下方的卡片"迟到"，观感像卡顿。
 */
export const STAGGER = 0.05
/** 列表错峰间隔（s，触摸设备）：比桌面更紧凑，保证长列表快速铺满 */
export const STAGGER_TOUCH = 0.03
/**
 * 列表错峰间隔（s，滚动揭示场景）
 *
 * Reveal / BlurReveal 是「滚动到视口才触发」，用户已带着预期等待，
 * 因此比列表初次入场更舒缓。
 */
export const STAGGER_REVEAL = 0.06
/** 入场位移（px） */
export const ENTER_DISTANCE = 14
/** 底部抽屉上滑位移（px） */
export const SHEET_DISTANCE = 32
/** 列表卡片错峰封顶：默认（滚动揭示等场景）超过该索引不再递增延迟 */
export const STAGGER_CAP = 6
/**
 * 列表卡片错峰封顶（长列表）：入场是初次挂载行为，用户会盯着列表看完，
 * 因此比滚动揭示允许更长的错峰链（延迟上限 = 8 * 0.05 = 400ms）。
 */
export const STAGGER_CAP_LIST = 8

/* ──────────────────────────────
   Spring Cascade（物理弹簧 · 仅位移 / 缩放）
   ──────────────────────────────
   对齐 skills/ui-polish-engine/tokens/spring.css 的 responsive 档：
   stiffness 320 / damping 26 / mass 1 → 临界阻尼附近，收尾利落、回弹极弱。
   参数走 lib/motion 单一来源（visual-qa 禁止组件内硬编码 duration / spring）。
*/

/** 弹簧刚度（对应 --spring-responsive-stiffness） */
export const SPRING_STIFFNESS = 320
/** 弹簧阻尼（对应 --spring-responsive-damping）：接近临界阻尼，避免可见弹跳 */
export const SPRING_DAMPING = 26
/** 弹簧质量 */
export const SPRING_MASS = 1

/** 纯 opacity 过渡（spring 不适合驱动透明度，单列一个短缓动） */
export const SPRING_FADE = 0.18

/** 由当前动画时长（s）换算等效 damping：时长越长 → 阻尼越低 → 回弹越明显 */
function dampingFor(duration: number): number {
  const ratio = duration / DUR_CARD
  return ratio >= 1 ? SPRING_DAMPING : SPRING_DAMPING + (1 - ratio) * 8
}

/**
 * 生成 Spring Cascade 过渡（返回新对象，可直接展开覆盖单字段）
 *
 * @param duration 时长提示（s）：framer-motion 会把它折算为等效 stiffness，
 *                 使短距离 / 长距离入场共用同一节奏，不会因位移量不同而快慢不一
 * @param delay    错峰延迟（s）
 */
export function springTransition(duration: number, delay = 0) {
  return {
    type: "spring" as const,
    stiffness: SPRING_STIFFNESS,
    damping: dampingFor(duration),
    mass: SPRING_MASS,
    duration,
    delay,
  }
}
