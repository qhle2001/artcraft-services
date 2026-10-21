use sqlx::{Executor, MySql};

pub struct ClearGoClawInstanceSettingsArgs<T> {
  pub mysql_executor: T,
}

pub async fn clear_goclaw_instance_settings<'c, T>(
  args: ClearGoClawInstanceSettingsArgs<T>,
) -> Result<(), sqlx::Error>
where
  T: Executor<'c, Database = MySql>,
{
  sqlx::query("DELETE FROM goclaw_instance_settings WHERE setting_name = 'goclaw'")
    .execute(args.mysql_executor)
    .await?;
  Ok(())
}
