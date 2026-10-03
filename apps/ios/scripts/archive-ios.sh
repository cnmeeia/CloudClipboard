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

# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

ARCHIVE_PATH="${IOS_DIR}/build/CloudClipboard.xcarchive"

require_xcodebuild
ensure_project

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
