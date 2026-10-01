/**
 * E2EE 解密工具（Web 端）
 * 从 IndexedDB 获取 master key，解密 clipboard item
 */

import { getMasterKey, decryptClipboardContent, decrypt } from "@cloudclipboard/crypto"
import type { ClipboardItem } from "@cloudclipboard/types"

/** 解密单个剪贴板条目，返回明文 */
export async function decryptItem(item: ClipboardItem): Promise<string> {
  const encrypted = item.encrypted_data

  // API Token / curl 上传的明文条目（plain=1）：encrypted_data 即明文，无需解密
  if (item.plain || (encrypted && !item.iv && !item.wrapped_key)) {
    return encrypted || ""
  }

  const masterKey = await getMasterKey()
  if (!masterKey) {
    throw new Error("NO_MASTER_KEY")
  }
  const iv = item.iv
  const wrappedKey = item.wrapped_key
  const salt = item.salt

  if (!encrypted || !iv) return ""

  // 新格式：wrapped key 模式
  if (wrappedKey && salt) {
    return decryptClipboardContent(encrypted, iv, wrappedKey, salt, masterKey)
  }

  // 旧格式兼容：直接用 master key 解密（V1 数据）
  return decrypt(encrypted, iv, masterKey)
}
