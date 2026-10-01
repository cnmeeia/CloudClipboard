/**
 * 测试环境全局初始化
 *
 * - 标记 React act 环境，消除 "not configured to support act(...)" 警告
 *   （组件级测试必须设置，否则状态更新无法被 act 正确刷新，
 *   断言可能读到过期的 DOM 值，测试会变得不可信）
 * - 补齐 jsdom 缺失的 matchMedia（PushForm 用它判断移动端）
 */

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false
      },
    }),
  })
}

export {}
