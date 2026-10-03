#!/usr/bin/env bash
# common.sh —— iOS 脚本公共前置（被 build-ios.sh / test-ios.sh / archive-ios.sh 引用）
#
# 提供：
#   set -euo pipefail
#   SCRIPT_DIR / IOS_DIR / PROJECT / SCHEME
#   log() / die()
#   require_xcodebuild / ensure_project（xcodegen 生成工程）

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECT="${IOS_DIR}/CloudClipboard.xcodeproj"
SCHEME="${SCHEME:-CloudClipboard}"

log() { printf '\033[1;34m▶ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

require_xcodebuild() {
  command -v xcodebuild >/dev/null 2>&1 || die "未找到 xcodebuild：请在 macOS 上运行（需 Xcode 15+）"
}

# 工程不存在时用 XcodeGen 生成（CI 与本地共用）
ensure_project() {
  if [[ ! -d "${PROJECT}" ]]; then
    if command -v xcodegen >/dev/null 2>&1; then
      log "未找到 ${PROJECT}，用 XcodeGen 生成"
      (cd "${IOS_DIR}" && xcodegen generate)
    else
      die "缺少 ${PROJECT}。请安装 XcodeGen（brew install xcodegen）后在 apps/ios 执行 xcodegen generate"
    fi
  fi
}
