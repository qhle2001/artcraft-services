use std::collections::HashSet;

use goclaw_client::GoClawClient;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::http_server::common_responses::common_web_error::CommonWebError;
use super::super::goclaw_generate_handler::GoClawMediaType;

const DEFAULT_CONFIG_FILE: &str = "build/selfhost/re-implement/goclaw/config.json";

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GoClawFileConfig {
  pub url: String,
  pub api_token: String,
  pub agents: Vec<ConfiguredGoClawAgent>,
}

#[derive(Deserialize, Serialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ConfiguredGoClawAgent {
  pub id: String,
  pub name: String,
  #[serde(default)]
  pub description: String,
  #[serde(rename = "type")]
  pub media_type: GoClawMediaType,
}

impl GoClawFileConfig {
  pub fn client_for_agent(
    &self,
    agent_id: &str,
    media_type: GoClawMediaType,
  ) -> Result<GoClawClient, CommonWebError> {
    if !self.agents.iter().any(|agent| agent.id == agent_id && agent.media_type == media_type) {
      return Err(CommonWebError::BadInputWithSimpleMessage(
        "The selected GoClaw agent is not configured for this media type".to_string(),
      ));
    }
    self.client()
  }

  fn client(&self) -> Result<GoClawClient, CommonWebError> {
    GoClawClient::new(&self.url, self.api_token.clone()).map_err(|_| config_error())
  }

  fn validate(&self) -> Result<(), CommonWebError> {
    self.client()?;
    let mut agents = HashSet::new();
    for agent in &self.agents {
      if agent.id.trim().is_empty()
        || agent.id != agent.id.trim()
        || agent.name.trim().is_empty()
        || !agents.insert((agent.id.as_str(), agent.media_type))
      {
        return Err(config_error());
      }
    }
    Ok(())
  }
}

/// Read each time so operators can update the mounted config without rebuilding.
pub async fn load_config() -> Result<GoClawFileConfig, CommonWebError> {
  let path = std::env::var("GOCLAW_CONFIG_FILE")
    .unwrap_or_else(|_| DEFAULT_CONFIG_FILE.to_string());
  let content = tokio::fs::read_to_string(path).await.map_err(|_| config_error())?;
  let config: GoClawFileConfig = serde_json::from_str(&content).map_err(|_| config_error())?;
  config.validate()?;
  Ok(config)
}

fn config_error() -> CommonWebError {
  // Neither JSON parser errors nor the contents are logged: the file has a token.
  log::error!("GoClaw config file is missing or invalid; check GOCLAW_CONFIG_FILE, URL, token and agent entries");
  CommonWebError::server_error_with_message("GoClaw configuration is unavailable; contact the server administrator")
}
