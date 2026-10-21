use std::sync::Arc;

use actix_web::{web, HttpRequest};
use actix_web::web::Json;
use serde::Serialize;
use utoipa::ToSchema;

use crate::http_server::common_responses::common_web_error::CommonWebError;
use crate::http_server::user_lookup::user_session::require_user_session::require_user_session;
use crate::state::server_state::ServerState;
use super::super::goclaw_generate_handler::GoClawAgentInfo;
use super::file_config::{load_config, ConfiguredGoClawAgent};

#[derive(Serialize, ToSchema)]
pub struct ConfiguredGoClawAgentsResponse {
  pub agents: Vec<ConfiguredGoClawAgent>,
}

#[derive(Serialize, ToSchema)]
pub struct GoClawAgentsResponse {
  pub agents: Vec<GoClawAgentInfo>,
}

pub async fn list_configured_agents_handler(
  request: HttpRequest,
  server_state: web::Data<Arc<ServerState>>,
) -> Result<Json<ConfiguredGoClawAgentsResponse>, CommonWebError> {
  let mut connection = server_state.mysql_pool.acquire().await?;
  require_user_session(&request, &server_state.session_checker, &mut *connection).await?;
  drop(connection);
  let config = load_config().await?;
  Ok(Json(ConfiguredGoClawAgentsResponse { agents: config.agents }))
}

/// Preserve the existing POST response for clients that only need agent metadata.
pub async fn list_agents_handler(
  request: HttpRequest,
  server_state: web::Data<Arc<ServerState>>,
) -> Result<Json<GoClawAgentsResponse>, CommonWebError> {
  let response = list_configured_agents_handler(request, server_state).await?;
  let agents = response.into_inner().agents.into_iter().map(|agent| GoClawAgentInfo {
    id: agent.id,
    name: agent.name,
    description: agent.description,
  }).collect();
  Ok(Json(GoClawAgentsResponse { agents }))
}
