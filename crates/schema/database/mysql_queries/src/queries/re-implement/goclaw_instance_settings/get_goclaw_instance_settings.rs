use sqlx::{Executor, MySql};

#[derive(Debug)]
pub struct GoClawInstanceSettings {
  pub goclaw_url: String,
  pub encrypted_api_token: String,
}

pub struct GetGoClawInstanceSettingsArgs<T> {
  pub mysql_executor: T,
}

pub async fn get_goclaw_instance_settings<'c, T>(
  args: GetGoClawInstanceSettingsArgs<T>,
) -> Result<Option<GoClawInstanceSettings>, sqlx::Error>
where
  T: Executor<'c, Database = MySql>,
{
  let row = sqlx::query(
    "SELECT goclaw_url, encrypted_api_token FROM goclaw_instance_settings WHERE setting_name = 'goclaw'",
  )
  .fetch_optional(args.mysql_executor)
  .await?;

  Ok(row.map(|row| GoClawInstanceSettings {
    goclaw_url: sqlx::Row::get(&row, "goclaw_url"),
    encrypted_api_token: sqlx::Row::get(&row, "encrypted_api_token"),
  }))
}
