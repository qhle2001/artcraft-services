use errors::AnyhowResult;
use goclaw_client::GoClawClient;

/// GoClaw is optional for deployments that do not enable agent-backed generation.
/// Configure both environment variables together to enable it.
pub fn setup_goclaw_client() -> AnyhowResult<Option<GoClawClient>> {
  let base_url = easyenv::get_env_string_optional("GOCLAW_GENERATION_SERVICE_URL");
  let token = easyenv::get_env_string_optional("GOCLAW_API_TOKEN");

  match (base_url, token) {
    (None, None) => Ok(None),
    (Some(_), None) | (None, Some(_)) => Err(anyhow::anyhow!(
      "GOCLAW_GENERATION_SERVICE_URL and GOCLAW_API_TOKEN must be configured together"
    )),
    (Some(base_url), Some(token)) => Ok(Some(GoClawClient::new(&base_url, token)?)),
  }
}
