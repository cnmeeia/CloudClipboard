# CloudClipboard iOS v1.0.0（未签名构建）

> ⚠️ 这是一个**未签名**的 IPA，仅用于验证构建流程，**无法安装到 iPhone**。
> 安装到真机需要 Apple 签名：详见 `apps/ios/README.md`「免费 Apple ID（Personal Team）真机安装」一节，
> 或在仓库 Secrets 中配置开发者证书后重新触发构建。

- 构建环境：GitHub Actions `macos-15` + Xcode（`xcodegen generate` + `scripts/build-ios.sh ci`）
- 产物：`CloudClipboard-unsigned.ipa`（`Payload/CloudClipboard.app` 未签名打包）
- 源码分支：`release-ios`
