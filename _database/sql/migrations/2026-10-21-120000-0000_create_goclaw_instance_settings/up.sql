-- noinspection SqlDialectInspectionForFile
-- noinspection SqlNoDataSourceInspectionForFile
-- noinspection SqlResolveForFile
CREATE TABLE goclaw_instance_settings (
  setting_name VARCHAR(32) NOT NULL,
  goclaw_url VARCHAR(2048) NOT NULL,
  encrypted_api_token TEXT NOT NULL,
  updated_by_user_token VARCHAR(32) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_name),
  CONSTRAINT goclaw_instance_settings_singleton CHECK (setting_name = 'goclaw')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
