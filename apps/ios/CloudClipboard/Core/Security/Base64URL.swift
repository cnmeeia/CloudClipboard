//
//  Base64URL.swift
//  CloudClipboard
//
//  base64url 编解码，与 `packages/crypto/src/index.ts` 的
//  `base64UrlEncode` / `base64UrlDecode` 逐字节兼容：
//    - 使用 `-` `_` 替换 `+` `/`
//    - 去掉尾部 `=` padding
//    - 解码时容忍有无 padding
//

import Foundation

public enum Base64URL {
    /// 编码为 base64url（无 padding），与 Web 端 `base64UrlEncode` 一致。
    public static func encode(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    /// 解码 base64url，自动补齐 padding。非法输入返回 nil（不抛异常，避免解密流程崩溃）。
    public static func decode(_ string: String) -> Data? {
        var s = string
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let remainder = s.count % 4
        if remainder > 0 {
            s += String(repeating: "=", count: 4 - remainder)
        }
        return Data(base64Encoded: s, options: [.ignoreUnknownCharacters])
    }
}
