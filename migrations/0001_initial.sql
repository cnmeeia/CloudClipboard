-- CloudClipboard D1 初始 Schema
-- 认证：Cloudflare Zero Trust (Access) JWT
-- 推送：Bark（iOS）

-- ──────────────────────────
-- users
-- ──────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- ──────────────────────────
-- devices
-- ──────────────────────────
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Unknown Device',
  platform TEXT NOT NULL DEFAULT 'web',
  browser TEXT,
  device_type TEXT NOT NULL DEFAULT 'pwa',
  bark_url TEXT,
  last_seen INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revoked_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_created_at ON devices(created_at);

-- ──────────────────────────
-- clipboard_items
-- ──────────────────────────
CREATE TABLE IF NOT EXISTS clipboard_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  encrypted_data TEXT,
  iv TEXT,
  salt TEXT,
  wrapped_key TEXT,
  r2_key TEXT,
  size INTEGER,
  mime_type TEXT,
  filename TEXT,
  plain INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE INDEX IF NOT EXISTS idx_clipboard_items_user
  ON clipboard_items(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clipboard_items_expires
  ON clipboard_items(expires_at) WHERE expires_at IS NOT NULL;

-- ──────────────────────────
-- api_tokens（curl / 脚本 / CLI 通过 Bearer Token 调用 API）
-- ──────────────────────────
CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'api',
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  expires_at INTEGER,
  revoked_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_expires ON api_tokens(expires_at) WHERE revoked_at IS NULL;

-- ──────────────────────────
-- audit_logs
-- ──────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  device_id TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- ──────────────────────────
-- rate_limits（D1 持久化限流计数）
-- ──────────────────────────
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);
