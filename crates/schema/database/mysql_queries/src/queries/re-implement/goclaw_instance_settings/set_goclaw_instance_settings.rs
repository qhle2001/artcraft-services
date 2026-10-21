use sqlx::{Executor, MySql};

pub struct SetGoClawInstanceSettingsArgs<'a, T> {
  pub goclaw_url: &'a str,
  pub encrypted_api_token: &'a str,
  pub updated_by_user_token: &'a str,
  pub mysql_executor: T,
}

pub async fn set_goclaw_instance_settings<'c, T>(
  args: SetGoClawInstanceSettingsArgs<'_, T>,
) -> Result<(), sqlx::Error>
where
  T: Executor<'c, Database = MySql>,
{
  sqlx::query(
    "INSERT INTO goclaw_instance_settings (setting_name, goclaw_url, encrypted_api_token, updated_by_user_token) VALUES ('goclaw', ?, ?, ?) ON DUPLICATE KEY UPDATE goclaw_url = VALUES(goclaw_url), encrypted_api_token = VALUES(encrypted_api_token), updated_by_user_token = VALUES(updated_by_user_token)",
  )
  .bind(args.goclaw_url)
  .bind(args.encrypted_api_token)
  .bind(args.updated_by_user_token)
  .execute(args.mysql_executor)
  .await?;
  Ok(())
}
