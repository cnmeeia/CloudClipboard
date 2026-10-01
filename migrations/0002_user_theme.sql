-- 用户级偏好（跨设备同步）：主题
-- 主题从「每设备 localStorage」升级为「账号级」：存到 users 表，
-- 各设备登录后拉取（GET /api/prefs），切换时推送（PUT /api/prefs）。
-- 默认 'system'：与旧行为一致，未设置时仍跟随各设备系统外观。
ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'system';
