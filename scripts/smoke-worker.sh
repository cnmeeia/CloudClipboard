#!/usr/bin/env bash
# CloudClipboard Worker 端到端冒烟测试
# 启动 wrangler dev（本地模拟），验证核心 API 链路
# 登录验证已移除：本地开发通过 CF_ACCESS_DEV_EMAIL 兜底身份，无需 Bearer token / 配对 OTP
# 用法: bash scripts/smoke-worker.sh

set -euo pipefail

cd "$(dirname "$0")/../apps/worker"

echo "▶ 启动 wrangler dev（本地）..."
npx wrangler dev --port 8788 --local > /tmp/cc-smoke.log 2>&1 &
WRANGLER_PID=$!
trap "kill $WRANGLER_PID 2>/dev/null || true" EXIT

# 等待就绪
for i in $(seq 1 30); do
  if curl -s -m 2 http://localhost:8788/api/health > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

# 本地开发兜底邮箱（与 .dev.vars 的 CF_ACCESS_DEV_EMAIL 对应）
DEV_EMAIL="${CF_ACCESS_DEV_EMAIL:-dev@example.com}"
DEVICE_ID="smoke-$(date +%s)"
DEVICE_NAME="Smoke MacBook"

echo "✅ 1. Health check"
curl -s -m 5 http://localhost:8788/api/health | python3 -m json.tool | head -12

echo ""
echo "✅ 2. 注册设备（upsert）"
REG=$(curl -s -m 5 -X POST http://localhost:8788/api/devices/register \
  -H "Content-Type: application/json" \
  -H "CF-Access-Authenticated-User-Email: $DEV_EMAIL" \
  -H "x-device-id: $DEVICE_ID" -H "x-device-name: $DEVICE_NAME" \
  -d "{\"id\":\"$DEVICE_ID\",\"name\":\"$DEVICE_NAME\",\"platform\":\"mac\"}")
echo "$REG" | python3 -c "import json,sys; d=json.load(sys.stdin); print('device:', d['device']['name'])"

echo ""
echo "✅ 3. 设备列表"
curl -s -m 5 http://localhost:8788/api/devices \
  -H "CF-Access-Authenticated-User-Email: $DEV_EMAIL" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('devices:', len(d['devices']), '| name:', d['devices'][0]['name'])"

echo ""
echo "✅ 4. 上传剪贴板（E2EE 密文）"
curl -s -m 5 -X POST http://localhost:8788/api/clipboard \
  -H "Content-Type: application/json" \
  -H "CF-Access-Authenticated-User-Email: $DEV_EMAIL" \
  -H "x-device-id: $DEVICE_ID" -H "x-device-name: $DEVICE_NAME" \
  -d '{"type":"code","encrypted_data":"CIPHERTEXT","iv":"IV","salt":"SALT","wrapped_key":"WK","expires_in":3600000}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('item:', d['item']['id'], '| type:', d['item']['type'])"

echo ""
echo "✅ 5. 剪贴板列表（确认无明文）"
curl -s -m 5 "http://localhost:8788/api/clipboard?limit=5" \
  -H "CF-Access-Authenticated-User-Email: $DEV_EMAIL" \
  | python3 -c "
import json,sys
d=json.load(sys.stdin)
item=d['items'][0]
print('count:', d['count'], '| encrypted:', item['encrypted_data'], '| content field:', 'content' in item)
assert 'content' not in item, '服务器泄露明文！'
assert item['encrypted_data'] == 'CIPHERTEXT', '密文不匹配'
print('✅ 服务器只存密文，无明文泄露')
"

echo ""
echo "🎉 冒烟测试全部通过！"
