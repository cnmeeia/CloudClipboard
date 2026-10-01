/** 去掉 URL 末尾斜杠 */
export function trimTrailingSlash(url: string): string {
  return url.trim().replace(/\/+$/, "")
}

/** 触屏设备（移动端无快捷键提示） */
export function isPointerCoarse(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches
}
