/**
 * Bark 推送（iOS Bark App）
 * 文档：https://bark.day.app
 *
 * 隐私：Bark 服务器会看到标题/正文。为了保持 E2EE 承诺，
 * 这里只发送"有新剪贴板"的提示，不携带明文内容。
 */

export interface BarkPayload {
  title: string
  body: string
  /** 点击通知跳转的 URL */
  url?: string
  /** 通知分组 */
  group?: string
  sound?: string
}

/**
 * 发送一条 Bark 推送
 * @param barkUrl 形如 https://api.day.app/DEVICEKEY 的完整 URL
 * @returns 是否成功
 */
export async function sendBarkNotification(
  barkUrl: string,
  payload: BarkPayload
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const normalized = barkUrl.replace(/\/+$/, "")
    const parts = normalized.split("/")
    const key = parts[parts.length - 1]
    const base = parts.slice(0, -1).join("/")
    if (!key || !/^https?:\/\//.test(base)) {
      return { ok: false, error: "Bark URL 格式不正确" }
    }
    const url = `${base}/push`
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        device_key: key,
        title: payload.title,
        body: payload.body,
        url: payload.url,
        group: payload.group,
        sound: payload.sound,
      }),
    })
    if (!res.ok) {
      return { ok: false, status: res.status, error: `Bark 返回 ${res.status}` }
    }
    return { ok: true, status: res.status }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Bark 请求失败" }
  }
}

/** 给其他设备发送"有新剪贴板"通知（不含明文） */
export async function fanOutBark(
  barkUrls: string[],
  sourceDeviceName: string
): Promise<void> {
  await Promise.allSettled(
    barkUrls.map((u) =>
      sendBarkNotification(u, {
        title: "CloudClipboard",
        body: `${sourceDeviceName} 发送了一条新剪贴板`,
        group: "cloudclipboard",
      })
    )
  )
}
