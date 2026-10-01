-- 通知偏好（账号级，跨设备同步）
-- 与主题偏好类似，通知偏好按用户存储，而非每设备。
-- 旧版本通知偏好仅存于 localStorage，导致其他设备配置无法同步，
-- 且 Worker 无法在发送 Bark 推送时做偏好过滤。

ALTER TABLE users ADD COLUMN notif_new_clipboard INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN notif_device_online INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN notif_device_added INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN notif_security_alert INTEGER NOT NULL DEFAULT 1;
