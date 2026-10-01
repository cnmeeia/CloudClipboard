-- 用户表增加 cf_subject（Cloudflare Access JWT sub 标识）
-- 
-- 目的：
-- 1. 绑定 JWT 的 sub 作为用户唯一标识，与 email 解耦（email 可改，sub 不变）
-- 2. 生产环境在 requireAuth 时自动 upsert users 表，确保用户始终存在
-- 3. 与现有 id（由 email SHA-256 派生的稳定 userId）并存：id 保持向后兼容，
--    cf_subject 用于 JWT 身份绑定
--
-- 注：JWT sub 通常是邮箱地址（Cloudflare Access 默认 sub == email），
-- 但作为独立列存储以便未来 sub 与 email 分离时仍能正确关联。
ALTER TABLE users ADD COLUMN cf_subject TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_cf_subject ON users(cf_subject) WHERE cf_subject IS NOT NULL;
