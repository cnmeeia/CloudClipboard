#!/usr/bin/env bash
#
# archive-ios.sh —— 生成 .xcarchive
#
# 无 Apple Developer 证书时生成 **unsigned archive**（诚实说明：不能用于分发，
# 只用于验证 Archive 过程与产物结构，任务书 §31 允许）。
#
# 用法：
#   ./scripts/archive-ios.sh                      # unsigned archive
#   TEAM=ABCDE12345 ./scripts/archive-ios.sh      # 使用本地 Personal Team 签名
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECT="${IOS_DIR}/CloudClipboard.xcodeproj"
ARCHIVE_PATH="${IOS_DIR}/build/CloudClipboard.xcarchive"

log() { printf '\033[1;34m▶ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

command -v xcodebuild >/dev/null 2>&1 || die "未找到 xcodebuild：请在 macOS 上运行"

if [[ ! -d "${PROJECT}" ]] && command -v xcodegen >/dev/null 2>&1; then
  (cd "${IOS_DIR}" && xcodegen generate)
fi

if [[ -n "${TEAM:-}" ]]; then
  log "签名归档（TEAM=${TEAM}）"
  SIGN_ARGS=(
    CODE_SIGN_STYLE=Automatic
    DEVELOPMENT_TEAM="${TEAM}"
  )
else
  log "无签名归档（不可用于分发，仅验证流程）"
  SIGN_ARGS=(
    CODE_SIGNING_ALLOWED=NO
    CODE_SIGNING_REQUIRED=NO
    CODE_SIGN_IDENTITY=""
  )
fi

xcodebuild \
  -project "${PROJECT}" \
  -scheme CloudClipboard \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -archivePath "${ARCHIVE_PATH}" \
  -derivedDataPath "${IOS_DIR}/build" \
  "${SIGN_ARGS[@]}" \
  archive

log "ARCHIVE SUCCEEDED → ${ARCHIVE_PATH}"
