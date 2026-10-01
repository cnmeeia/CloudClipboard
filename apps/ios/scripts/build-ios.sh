#!/usr/bin/env bash
#
# build-ios.sh —— 一键构建 CloudClipboard iOS
#
# 覆盖两种场景：
#   1) 无签名构建（CI / 无 Apple Developer 账号）：默认行为
#        ./scripts/build-ios.sh
#      产物在 build/Build/Products/Debug-iphoneos 或 -iphonesimulator
#   2) 本地真机（免费 Personal Team）：显式传 TEAM
#        TEAM=ABCDE12345 ./scripts/build-ios.sh device
#
# 用法：
#   ./scripts/build-ios.sh [simulator|device|ci]
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECT="${IOS_DIR}/CloudClipboard.xcodeproj"
SCHEME="CloudClipboard"
MODE="${1:-ci}"

log() { printf '\033[1;34m▶ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

# ── 前置检查 ─────────────────────────────────────────────
command -v xcodebuild >/dev/null 2>&1 || die "未找到 xcodebuild：请在 macOS 上运行（需 Xcode 15+）"

# 生成工程（若使用 XcodeGen 定义）
if [[ ! -d "${PROJECT}" ]]; then
  if command -v xcodegen >/dev/null 2>&1; then
    log "未找到 ${PROJECT}，用 XcodeGen 生成"
    (cd "${IOS_DIR}" && xcodegen generate)
  else
    die "缺少 ${PROJECT}。请安装 XcodeGen（brew install xcodegen）后在 apps/ios 执行 xcodegen generate"
  fi
fi

log "Xcode: $(xcodebuild -version | head -1)"

# 免费 Personal Team 下 App Groups / Universal Links 不可用，
# 未签名构建时直接关闭签名，避免 entitlement 校验失败。
COMMON_ARGS=(
  -project "${PROJECT}"
  -scheme "${SCHEME}"
  -configuration Debug
  -derivedDataPath "${IOS_DIR}/build"
  CODE_SIGNING_ALLOWED=NO
  CODE_SIGNING_REQUIRED=NO
  CODE_SIGN_IDENTITY=""
)

case "${MODE}" in
  simulator)
    log "构建 iOS 模拟器版本（无签名）"
    xcodebuild "${COMMON_ARGS[@]}" \
      -sdk iphonesimulator \
      -destination 'generic/platform=iOS Simulator' \
      build
    ;;

  device)
    if [[ -n "${TEAM:-}" ]]; then
      log "构建真机版本，开发团队 ${TEAM}"
      xcodebuild "${COMMON_ARGS[@]}" \
        -sdk iphoneos \
        -destination 'generic/platform=iOS' \
        CODE_SIGNING_ALLOWED=YES \
        CODE_SIGNING_REQUIRED=YES \
        CODE_SIGN_STYLE=Automatic \
        DEVELOPMENT_TEAM="${TEAM}" \
        build
    else
      log "构建真机版本（无签名；设置 TEAM=xxxxxxxxxx 可启用本地签名）"
      xcodebuild "${COMMON_ARGS[@]}" \
        -sdk iphoneos \
        -destination 'generic/platform=iOS' \
        build
    fi
    ;;

  ci)
    log "CI 模式：无签名构建（iphoneos）"
    xcodebuild "${COMMON_ARGS[@]}" \
      -sdk iphoneos \
      -destination 'generic/platform=iOS' \
      build \
      | tail -40
    ;;

  *)
    die "未知模式：${MODE}（可选 simulator | device | ci）"
    ;;
esac

log "BUILD SUCCEEDED"
log "产物目录：${IOS_DIR}/build/Build/Products"
