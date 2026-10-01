import { describe, it, expect } from "vitest"
import {
  analyzeContent,
  formatRelativeTime,
  formatBytes,
  insertAtSelection,
  findDuplicateListItem,
  collapseDuplicatePaste,
  type ClipboardItemLike,
} from "../src/lib/content"

describe("内容智能识别（§25/§26）", () => {
  it("识别 URL 及域名", () => {
    const info = analyzeContent("https://example.com/page")
    expect(info.kind).toBe("url")
    expect(info.domain).toBe("example.com")
  })

  it("识别纯文本", () => {
    const info = analyzeContent("Hello world")
    expect(info.kind).toBe("text")
  })

  it("识别 Shell 命令（docker）", () => {
    const info = analyzeContent("docker compose up -d")
    expect(info.kind).toBe("shell")
  })

  it("识别代码", () => {
    const info = analyzeContent("const x = 1;\nconst y = 2;")
    expect(info.kind).toBe("code")
  })

  it("识别 JSON", () => {
    const info = analyzeContent('{"name": "test"}')
    expect(info.kind).toBe("code")
    expect(info.isJson).toBe(true)
  })

  it("识别 OTP 验证码", () => {
    const info = analyzeContent("你的验证码是 123456")
    expect(info.kind).toBe("otp")
    expect(info.otp).toBe("123456")
  })

  it("识别颜色", () => {
    const info = analyzeContent("#0A84FF")
    expect(info.kind).toBe("color")
    expect(info.colorHex).toBe("#0A84FF")
  })
})

describe("格式化工具", () => {
  it("formatRelativeTime 刚刚", () => {
    expect(formatRelativeTime(Date.now())).toBe("刚刚")
  })

  it("formatBytes", () => {
    expect(formatBytes(512)).toBe("512 B")
    expect(formatBytes(2048)).toBe("2.0 KB")
  })
})

/**
 * 回归测试：Issue #86「双重粘贴直接两次」
 *
 * 根因：PushForm 的 textarea 是受控组件，onPaste 里既 setContent(text) 又没有
 * preventDefault()，浏览器的默认粘贴行为把同一段文本再插一次 → 内容出现两遍
 * （截图：同一个 hash 连续两行，65 字符）。
 * 修复：onPaste 里 preventDefault() 接管插入，插入结果由 insertAtSelection 计算。
 */
describe("粘贴插入（Issue #86 回归）", () => {
  const HASH = "5700f6c4aa9244b99999907804c307bb"

  it("空输入框粘贴一次 → 只出现一次（不被追加两遍）", () => {
    const r = insertAtSelection("", HASH, 0, 0)
    expect(r.value).toBe(HASH)
    expect(r.value).not.toBe(HASH + HASH)
    expect(r.value.length).toBe(32)
  })

  it("光标插在中间 → 保留前后文，且不重复", () => {
    const r = insertAtSelection("AB", "X", 1, 1)
    expect(r.value).toBe("AXB")
    expect(r.caret).toBe(2)
  })

  it("有选区 → 替换选区内容（而不是叠加）", () => {
    const r = insertAtSelection("hello world", "CNB", 6, 11)
    expect(r.value).toBe("hello CNB")
    expect(r.caret).toBe(9)
  })

  it("无选区信息（selectionStart 为 null）→ 末尾追加一次", () => {
    const r = insertAtSelection("abc", "ZZ", null, null)
    expect(r.value).toBe("abcZZ")
    expect(r.caret).toBe(5)
  })

  it("非法选区（end < start / 越界）→ 安全回退，不产生重复内容", () => {
    expect(insertAtSelection("abc", "Z", 3, 1).value).toBe("abcZ")
    expect(insertAtSelection("abc", "Z", 99, 99).value).toBe("abcZ")
    expect(insertAtSelection("abc", "Z", -5, undefined).value).toBe("abcZ")
  })

  it("插入多行文本：行数正确，字符数翻倍即失败", () => {
    const r = insertAtSelection("", "l1\nl2", 0, 0)
    expect(r.value.split("\n")).toHaveLength(2)
    expect(r.value.length).toBe(5)
  })
})

/**
 * 回归测试：Issue #86「双重粘贴直接两次」
 *
 * 第一层（#87）：textarea 受控组件缺 preventDefault，一次粘贴进两条 → 输入框变成两份。
 * 第二层（本次）：POST /api/clipboard 非幂等，重试/双击同步会真的落库两条，
 *   前端 `[item, ...prev]` 再加一条 → 列表里出现两张一模一样的卡片。
 *   findDuplicateListItem 负责在乐观插入前识别这条重复。
 */
describe("列表去重（Issue #86 第二层回归）", () => {
  const HASH = "5700f6c4aa9244b99999907804c307bb"
  const NOW = 1_800_000_000_000

  const mk = (over: Partial<ClipboardItemLike> = {}): ClipboardItemLike => ({
    id: "a",
    device_id: "iphone-1",
    type: "text",
    created_at: NOW,
    content: HASH,
    ...over,
  })

  it("刚上传的同内容记录 → 命中，不再叠第二张卡片", () => {
    const list = [mk({ id: "a", created_at: NOW })]
    const incoming = mk({ id: "b", created_at: NOW + 400 })
    expect(findDuplicateListItem(list, incoming, HASH)).toBe(0)
  })

  it("同 id 的记录已在列表 → 命中（刷新后回填不重复）", () => {
    const list = [mk({ id: "a" })]
    expect(findDuplicateListItem(list, mk({ id: "a" }), HASH)).toBe(0)
  })

  it("内容不同的新记录 → 不命中，正常新增", () => {
    const list = [mk({ id: "a" })]
    const incoming = mk({ id: "b", content: "另一段内容" })
    expect(findDuplicateListItem(list, incoming, "另一段内容")).toBe(-1)
  })

  it("不同设备 / 不同类型 → 不命中（各自独立记录）", () => {
    const list = [mk({ id: "a" })]
    expect(findDuplicateListItem(list, mk({ id: "b", device_id: "mac-1" }), HASH)).toBe(-1)
    expect(findDuplicateListItem(list, mk({ id: "b", type: "code" }), HASH)).toBe(-1)
  })

  it("间隔较久（用户有意重复同步）→ 不命中，保留两条", () => {
    const list = [mk({ id: "a", created_at: NOW })]
    const incoming = mk({ id: "b", created_at: NOW + 10 * 60_000 })
    expect(findDuplicateListItem(list, incoming, HASH)).toBe(-1)
  })

  it("列表项尚未解密（content 为空）→ 不误判为重复", () => {
    const list = [mk({ id: "a", content: undefined })]
    expect(findDuplicateListItem(list, mk({ id: "b" }), HASH)).toBe(-1)
  })

  it("明文为空（加密上传未回填）→ 不命中，避免吞掉合法内容", () => {
    const list = [mk({ id: "a" })]
    expect(findDuplicateListItem(list, mk({ id: "b" }), "")).toBe(-1)
  })

  it("空列表 → 不命中", () => {
    expect(findDuplicateListItem([], mk({ id: "b" }), HASH)).toBe(-1)
  })

  it("连续两次上传同内容：第二次只替换不新增，列表长度保持 1", () => {
    const first = mk({ id: "a", created_at: NOW })
    let list: ClipboardItemLike[] = [first]
    const second = mk({ id: "b", created_at: NOW + 200 })
    const dupAt = findDuplicateListItem(list, second, HASH)
    list = dupAt === -1 ? [second, ...list] : list.map((it, i) => (i === dupAt ? second : it))
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe("b")
  })
})

/**
 * 回归测试：Issue #86 兜底 —— 同一次粘贴被重复插入时折叠回一份。
 *
 * 为什么需要：#87 依赖 preventDefault() 阻止浏览器默认插入；但个别
 * WebKit/PWA 版本仍会执行默认插入（或 paste 事件被派发两次），
 * 受控值里就会出现两份完全相同的粘贴内容（截图：65 字符 = 32+32+\n）。
 */
describe("粘贴重复插入兜底（Issue #86）", () => {
  const HASH = "5700f6c4aa9244b99999907804c307bb"

  it("正常单份结果 → 原样返回（不误伤）", () => {
    expect(collapseDuplicatePaste("", HASH, HASH)).toBe(HASH)
  })

  it("空基线 + 同内容连在一起出现两次（末尾带换行）→ 折叠回一份", () => {
    expect(collapseDuplicatePaste("", HASH + "\n" + HASH + "\n", HASH)).toBe(HASH)
  })

  it("空基线 + 同内容连在一起出现两次（中间带换行）→ 折叠回一份", () => {
    expect(collapseDuplicatePaste("", HASH + "\n" + HASH, HASH)).toBe(HASH)
  })

  it("空基线 + 同内容连在一起出现两次（无换行）→ 折叠回一份，不是 64 字符", () => {
    const doubled = HASH + HASH
    expect(doubled.length).toBe(64)
    expect(collapseDuplicatePaste("", doubled, HASH)).toBe(HASH)
  })

  it("基线非空（用户主动连续粘两次相同内容）→ 不折叠，不误伤", () => {
    const afterFirstPaste = HASH
    expect(collapseDuplicatePaste(afterFirstPaste, HASH + HASH, HASH)).toBe(HASH + HASH)
  })

  it("基线非空且已有其它内容 → 不折叠", () => {
    expect(collapseDuplicatePaste("prefix-", "prefix-" + HASH + HASH, HASH)).toBe(
      "prefix-" + HASH + HASH
    )
  })

  it("不同的两次粘贴（内容不同）→ 不折叠", () => {
    expect(collapseDuplicatePaste("", "AAABBB", "BBB")).toBe("AAABBB")
  })

  it("insert 为空 → 原样返回", () => {
    expect(collapseDuplicatePaste("", "abc", "")).toBe("abc")
  })

  it("单份内容但与 insert 不同 → 原样返回", () => {
    expect(collapseDuplicatePaste("", "zzz", HASH)).toBe("zzz")
  })
})
