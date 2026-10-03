#!/usr/bin/env bash
#
# test-ios.sh —— 运行单元测试（含 E2EE 跨端互通测试）
#
# 用法：
#   ./scripts/test-ios.sh
#

# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_xcodebuild
ensure_project

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
