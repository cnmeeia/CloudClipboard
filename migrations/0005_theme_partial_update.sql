-- 用户偏好（主题）按字段区分「未提供」与「显式清空」
--
-- 背景（线上复现的偏好丢失 bug）：
--   PUT /api/prefs 支持部分更新（只传 notification 或只传 theme）。
--   旧实现 `ON CONFLICT(id) DO UPDATE SET theme = excluded.theme` 在
--   INSERT 未提供 theme 列时，excluded.theme 取该列的默认值（'system'），
--   于是「只更新通知偏好」会把用户刚设的深色主题静默重置为跟随系统。
--   同理，audit_logs/user 行 upsert 等路径也会覆盖偏好列。
--
-- 修复：新增 theme_set 标记列，区分两种语义：
--   theme_set = 0 → 从未显式设置过主题，读取时回退默认 "system"
--   theme_set = 1 → theme 为最后一次显式设置的值（含显式设置的 "system"）
-- 并让所有偏好写入路径只更新自己负责的列。
ALTER TABLE users ADD COLUMN theme_set INTEGER NOT NULL DEFAULT 0;

-- 迁移前已存在、且与默认值不同的主题视为「用户显式设置过」
UPDATE users SET theme_set = 1 WHERE theme IS NOT NULL AND theme != 'system';
