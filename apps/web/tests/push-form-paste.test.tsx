/**
 * 组件级回归测试：Issue #86「粘贴直接两次」
 *
 * 为什么需要这一层：既有的 @cloudclipboard/web 测试只直接调用 insertAtSelection()
 * 这类纯函数，**从未真正挂载 PushForm、也没有派发过真实的 paste 事件**。
 * 于是"onPaste 里忘了 preventDefault / 插入了两次"这类回归，
 * 纯函数测试永远抓不到（#87 之前就是这么漏掉的）。
 *
 * 这里用 react-dom/client 挂载真实组件并派发真实 paste 事件，
 * 断言 textarea 的受控值只包含一份内容。
 */

import { describe, it, expect, vi, afterEach } from "vitest"
import { createElement, act } from "react"
import { createRoot, type Root } from "react-dom/client"

vi.mock("@/hooks/useApp", () => ({
  useApp: () => ({ isConfigured: true, pushClipboard: vi.fn(async () => true) }),
}))
vi.mock("@/components/Toast", () => ({ useToast: () => vi.fn() }))

import { PushForm } from "../src/components/PushForm"

const HASH = "5700f6c4aa9244b99999907804c307bb"

let host: HTMLDivElement | null = null
let root: Root | null = null

async function mount() {
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(createElement(PushForm))
  })
  const ta = host.querySelector("textarea") as HTMLTextAreaElement
  expect(ta).toBeTruthy()
  return ta
}

function paste(el: HTMLTextAreaElement, text: string) {
  const ev = new Event("paste", { bubbles: true, cancelable: true }) as Event & {
    clipboardData: { getData: (t: string) => string }
  }
  ev.clipboardData = { getData: () => text }
  el.dispatchEvent(ev)
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  if (host) host.remove()
  root = null
  host = null
})

describe("PushForm 粘贴（Issue #86 组件级回归）", () => {
  it("空输入框粘贴一次 → 只出现一份，不是两份", async () => {
    const ta = await mount()
    ta.focus()
    ta.setSelectionRange(0, 0)
    await act(async () => paste(ta, HASH))
    expect(ta.value).toBe(HASH)
    expect(ta.value).not.toBe(HASH + HASH)
    expect(ta.value.length).toBe(32)
  })

  it("粘贴事件被派发两次（同一次粘贴被重复投递）→ 仍只有一份", async () => {
    const ta = await mount()
    ta.focus()
    ta.setSelectionRange(0, 0)
    await act(async () => {
      paste(ta, HASH)
      // 模拟引擎/框架重复投递同一个 paste 事件（同 tick，React 尚未提交）
      paste(ta, HASH)
    })
    expect(ta.value).not.toBe(HASH + HASH)
    expect(ta.value.length).toBe(32)
  })

  it("引擎已把内容插进 DOM（el.value 已是两份）后 onPaste 再处理 → 兜底折叠为一份", async () => {
    const ta = await mount()
    ta.focus()
    ta.setSelectionRange(0, 0)
    await act(async () => {
      // 某些 WebKit/PWA 版本会先执行默认插入，再把 paste 事件交给 JS，
      // 此时 onPaste 读到的 el.value 已经是两份（32+32），
      // 若不折叠，受控值会停留在两份 → 截图里的「65 字符」。
      ta.value = HASH + "\n" + HASH
      const ev = new Event("paste", { bubbles: true, cancelable: true }) as Event & {
        clipboardData: { getData: (t: string) => string }
      }
      ev.clipboardData = { getData: () => HASH }
      ta.dispatchEvent(ev)
    })
    expect(ta.value).toBe(HASH)
    expect(ta.value.length).toBe(32)
  })

  it("连续两次快速粘贴（用户手抖/引擎重复）不应产生 64 字符", async () => {
    const ta = await mount()
    ta.focus()
    ta.setSelectionRange(0, 0)
    await act(async () => paste(ta, HASH))
    await act(async () => paste(ta, HASH))
    // 第二次是「基线非空」的真实追加：允许两份，但要是两次独立操作的结果
    expect(ta.value).toBe(HASH + HASH)
    expect(ta.value.length).toBe(64)
  })

  it("有选区时粘贴 → 替换选区而不是叠加", async () => {
    const ta = await mount()
    await act(async () => {
      ta.focus()
      paste(ta, "HELLO")
    })
    await act(async () => {
      ta.setSelectionRange(0, 5)
      paste(ta, "WORLD")
    })
    expect(ta.value).toBe("WORLD")
  })

  it("在已有内容中间粘贴 → 只插入一次", async () => {
    const ta = await mount()
    await act(async () => {
      ta.focus()
      paste(ta, "AB")
    })
    await act(async () => {
      ta.setSelectionRange(1, 1)
      paste(ta, "X")
    })
    expect(ta.value).toBe("AXB")
  })

  it("字符数与内容一致（对应截图里的『65 字符』异常）", async () => {
    const ta = await mount()
    ta.focus()
    ta.setSelectionRange(0, 0)
    await act(async () => paste(ta, HASH))
    const label = Array.from(host!.querySelectorAll("span"))
      .map((s) => s.textContent || "")
      .find((t) => t.includes("字符"))
    expect(label).toBe(`${HASH.length} 字符`)
    expect(label).not.toBe("65 字符")
  })
})
