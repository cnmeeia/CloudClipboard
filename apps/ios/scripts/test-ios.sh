#!/usr/bin/env bash
#
# test-ios.sh —— 运行单元测试（含 E2EE 跨端互通测试）
#
# 用法：
#   ./scripts/test-ios.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECT="${IOS_DIR}/CloudClipboard.xcodeproj"

log() { printf '\033[1;34m▶ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

command -v xcodebuild >/dev/null 2>&1 || die "未找到 xcodebuild：请在 macOS 上运行"

if [[ ! -d "${PROJECT}" ]]; then
  if command -v xcodegen >/dev/null 2>&1; then
    log "生成 Xcode 工程"
    (cd "${IOS_DIR}" && xcodegen generate)
  else
    die "缺少 ${PROJECT}，请先安装 XcodeGen 并执行 xcodegen generate"
  fi
fi

# 选一个可用的模拟器（优先 iPhone 16 / 15，回退到任意 iPhone）
SIMULATOR="${SIMULATOR:-$(xcrun simctl list devices available \
  | grep -Eo 'iPhone [0-9]+( Pro)?( Max)?' \
  | sort -u | tail -1)}"

if [[ -z "${SIMULATOR}" ]]; then
  die "找不到可用的 iPhone 模拟器"
fi

log "使用模拟器：${SIMULATOR}"

xcodebuild \
  -project "${PROJECT}" \
  -scheme CloudClipboard \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination "platform=iOS Simulator,name=${SIMULATOR}" \
  -resultBundlePath "${IOS_DIR}/build/TestResults.xcresult" \
  -derivedDataPath "${IOS_DIR}/build" \
  CODE_SIGNING_ALLOWED=NO \
  test

log "TEST SUCCEEDED"
