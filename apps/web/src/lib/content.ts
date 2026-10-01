/**
 * 内容智能识别（URL / 代码 / OTP / 颜色 / Shell / JSON / Emoji）
 */

export type ContentKind = "url" | "otp" | "color" | "shell" | "code" | "emoji" | "text"

export interface ContentInfo {
  kind: ContentKind
  url?: string
  domain?: string
  otp?: string
  lang?: string
  colorHex?: string
  emoji?: string
  isJson?: boolean
  formattedJson?: string
  faviconUrl?: string
}

export function analyzeContent(raw: string): ContentInfo {
  const text = (raw || "").trim()
  if (!text) return { kind: "text" }

  // 1. URL
  if (/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(text)) {
    try {
      const parsed = new URL(text)
      return {
        kind: "url",
        url: text,
        domain: parsed.hostname,
        faviconUrl: `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=64`,
      }
    } catch {
      // fallthrough
    }
  }

  // 2. 颜色
  const hexMatch = text.match(/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/)
  const rgbMatch = text.match(/^rgba?\((\s*\d+\s*,){2}\s*\d+\s*(,\s*[\d.]+\s*)?\)$/i)
  const hslMatch = text.match(/^hsla?\(\s*\d+\s*(,\s*[\d.]+%?\s*){2}(,\s*[\d.]+\s*)?\)$/i)
  if (hexMatch || rgbMatch || hslMatch) {
    return { kind: "color", colorHex: text }
  }

  // 3. OTP
  const pureDigits = text.match(/^\b\d{4,8}\b$/)
  if (pureDigits) {
    return { kind: "otp", otp: pureDigits[0] }
  }
  const otpTextMatch =
    text.match(/(?:验证码|校验码|动态码|code|OTP|token)[:：\s\b]*([0-9a-zA-Z]{4,8})\b/i) ||
    text.match(/([0-9]{4,8})\s*(?:为您的|是您的|做为您的|即为您的)?(?:验证码|校验码|动态码)/i) ||
    text.match(/(?:验证码|校验码|动态码)(?:是|为|:|：|\s)+([0-9]{4,8})/i) ||
    text.match(/(?:验证码|校验码|动态码)\D{0,4}([0-9]{4,8})/i)
  if (otpTextMatch?.[1] && /^\d{4,8}$/.test(otpTextMatch[1])) {
    return { kind: "otp", otp: otpTextMatch[1] }
  }

  // 4. Emoji
  const emojiOnly = /^[\p{Extended_Pictographic}\p{Emoji}\s]+$/u.test(text)
  const emojiSingle = text.match(/^[\p{Extended_Pictographic}]+$/u)
  if (emojiOnly && emojiSingle) {
    return { kind: "emoji", emoji: emojiSingle[0] }
  }

  const lines = text.split("\n")
  const lineCount = lines.length

  // 5. Shell
  const isShell =
    /^(cd |ls |git |npm |pnpm |yarn |npx |docker |kubectl |curl |ssh |sudo |chmod |mv |cp |rm |mkdir |wget |brew |apt |pip |go |rustc |cargo |python |node |python3 |pip3)/m.test(text) ||
    (lineCount > 1 && text.includes("$ ") && !text.includes("{"))
  if (isShell) {
    return { kind: "shell", lang: "shell" }
  }

  // 6. JSON
  if (
    (text.startsWith("{") && text.endsWith("}")) ||
    (text.startsWith("[") && text.endsWith("]"))
  ) {
    try {
      const parsed = JSON.parse(text)
      const formattedJson = JSON.stringify(parsed, null, 2)
      return { kind: "code", isJson: true, formattedJson, lang: "json" }
    } catch {
      // not JSON
    }
  }

  // 7. Code
  const isCodeSnippet =
    lineCount > 1 &&
    (/^(import |export |const |let |var |function |class |def |public |private |<\?php|<html>)/m.test(text) ||
      text.includes("=>") ||
      text.includes("function(") ||
      text.includes("console.log"))
  if (isCodeSnippet) {
    return { kind: "code", lang: "text" }
  }

  return { kind: "text" }
}

/**
 * 把粘贴/插入的文本插入到受控输入框的指定区间，返回新值与新光标位置。
 *
 * 背景（Issue #86「双重粘贴直接两次」）：
 * PushForm 的 textarea 是受控组件（value + onChange）。原实现在 onPaste 里
 * 只 setContent(text)，却没有 preventDefault()，于是浏览器的默认粘贴行为
 * 又把同一段文本插进 DOM，React 重渲染后内容变成两份。
 * 修复后由本函数显式算出插入结果，并在事件里 preventDefault() 接管插入。
 *
 * @param value  当前受控值
 * @param insert 待插入文本
 * @param start  选区起点（null/undefined → 追加到末尾）
 * @param end    选区终点（默认与 start 相同，即插入不覆盖）
 */
export function insertAtSelection(
  value: string,
  insert: string,
  start?: number | null,
  end?: number | null
): { value: string; caret: number } {
  const len = value.length
  // 越界/非法选区一律回退到"末尾插入"，避免 slice 出现意外结果
  const s = typeof start === "number" && start >= 0 && start <= len ? start : len
  const e = typeof end === "number" && end >= s && end <= len ? end : s
  return {
    value: value.slice(0, s) + insert + value.slice(e),
    caret: s + insert.length,
  }
}

/**
 * 兜底去重：识别「同一次粘贴被引擎插入两次」的形态并收敛回一份。
 *
 * 背景（Issue #86）：用户反馈一次粘贴出现两份（截图 65 字符 = 32+32+\n）。
 * `insertAtSelection` 依赖 `preventDefault()` 阻止浏览器默认插入，但个别
 * WebKit/PWA 版本仍会先执行默认插入再把 paste 事件交给 JS。
 *
 * 关键约束：**不能误伤用户主动连续粘贴两次相同内容**。
 * 因此这里要求调用方传入"本次粘贴前的基线"，且基线必须为空
 * （即粘贴前输入框是空的）——只有这种场景才可能是引擎重复插入。
 * 用户先粘一次、再粘一次时，第二次的基线已非空，不会被折叠。
 *
 * @param prev   本次粘贴前的值（基线）
 * @param next   计算后的候选值
 * @param insert 本次粘贴的文本
 */
export function collapseDuplicatePaste(prev: string, next: string, insert: string): string {
  if (!insert) return next
  // 基线非空 → 说明输入框里已有用户内容，不做任何折叠，避免误伤
  if (prev !== "") return next
  const forms = [insert + insert, insert + "\n" + insert, insert + "\n" + insert + "\n"]
  return forms.includes(next) ? insert : next
}

/** Bark / 站点 URL 校验（http/https） */
export function isHttpUrl(text: string): boolean {
  return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(text.trim())
}

/** 内容识别结果 → 上传类型（url / code / text） */
export function toClipboardType(info: ContentInfo): "url" | "code" | "text" {
  if (info.kind === "url") return "url"
  if (info.kind === "code" || info.kind === "shell") return "code"
  return "text"
}

/** 类型标签（卡片 chip / 命令面板共用） */
export const TYPE_LABELS: Record<string, string> = {
  text: "文本",
  url: "链接",
  code: "代码",
}

/** 按关键词过滤剪贴板条目（明文未知，搜类型/时间等元数据由调用方补充关键词） */
export function searchItems<T>(items: T[], keyword: string, match: (item: T) => string): T[] {
  const q = keyword.trim().toLowerCase()
  if (!q) return items
  return items.filter((i) => match(i).toLowerCase().includes(q))
}

/** 相对时间 */
export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const s = Math.floor(diff / 1000)
  if (s < 60) return "刚刚"
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  return `${Math.floor(h / 24)} 天前`
}

/**
 * 过期剩余时间文案（用于卡片 / 详情页提示"还差多久消失"）。
 * 传 null 表示永久保存（服务端 expires_at = NULL，不会被自动清理）。
 * 已过期返回 null（由调用方按"已过期"处理）。
 */
export function formatExpiry(expiresAt: number | null, now = Date.now()): string | null {
  if (expiresAt == null) return "永久保存"
  const diff = expiresAt - now
  if (diff <= 0) return null
  const m = Math.floor(diff / 60000)
  if (m < 1) return "不到 1 分钟"
  if (m < 60) return `${m} 分钟后`
  const h = Math.floor(m / 60)
  if (h < 24) return h < 48 ? `${h} 小时后` : `${Math.floor(h / 24)} 天后`
  return `${Math.floor(h / 24)} 天后`
}

/** 字节格式化 */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

/**
 * 判断「刚上传成功的那条」是否已经在列表里了，用于 UI 层去重。
 *
 * 背景（Issue #86「双重粘贴直接两次」）：用户看到 **列表里出现两条一模一样的记录**。
 * 根因是 POST /api/clipboard 本身不是幂等的——每次请求都会 INSERT 一条新记录：
 *   - 网络抖动 / 页面从后台切回 → fetch 被重试
 *   - 把 Ctrl/⌘+Enter 连按两下
 *   - 点「同步」时手指/鼠标抖动触发两次 click
 * 这些都会真的落库两条一模一样的密文，前端的 `[item, ...prev]` 也跟着叠两条，
 * 看起来就像「剪贴板双重了」。
 *
 * 修复：乐观插入前先按「同内容 + 同类型」查重，命中就不再叠第二张卡片，
 * 同时用服务端返回的最新记录替换本地那条（id / created_at 以服务端为准）。
 *
 * @param list     当前列表（通常是 prev）
 * @param item     服务端刚返回的新记录
 * @param content  新记录的明文（用于和列表项比对，列表项解密后也有）
 * @returns -1 表示未命中；否则返回列表中命中的下标
 */
export function findDuplicateListItem(
  list: readonly ClipboardItemLike[],
  item: ClipboardItemLike,
  content: string | null | undefined,
  windowMs = 60_000
): number {
  if (!content) return -1
  const deviceId = item.device_id
  const type = item.type
  const createdAt = item.created_at
  for (let i = 0; i < list.length; i++) {
    const candidate = list[i]
    if (candidate.id === item.id) return i
    if (candidate.device_id !== deviceId || candidate.type !== type) continue
    // 只看「刚刚」的记录：更早的同内容记录属于用户有意重复同步，不能被吞掉
    const gap = Math.abs(createdAt - candidate.created_at)
    if (gap > windowMs) continue
    if (candidate.content === content) return i
  }
  return -1
}

/** findDuplicateListItem 只需要这几个字段，抽出来便于测试与复用 */
export interface ClipboardItemLike {
  id: string
  device_id: string
  type: string
  created_at: number
  /** 已解密的明文（列表项解密后写入；未解密时为 undefined） */
  content?: string
}
