use std::sync::Arc;

use actix_web::{web, HttpRequest};
use actix_web::web::Json;
use goclaw_client::{CreateGenerationRequest, GenerationReferenceMedia, GoClawAgent};
use http_server_common::request::get_request_ip::get_request_ip;
use serde::{Deserialize, Serialize};
use tokens::tokens::media_files::MediaFileToken;

use crate::http_server::common_responses::common_web_error::CommonWebError;
use crate::http_server::endpoints::omni_api::shared_utils::media_uploads::upload_url_to_media_file::{
  upload_bytes_to_media_file, MediaUploadKind,
};
use crate::http_server::user_lookup::api_or_web_session::require_any_session_or_key::require_any_session_or_key;
use crate::http_server::validations::validate_idempotency_token_format::validate_idempotency_token_format;
use crate::state::server_state::ServerState;
use mysql_queries::queries::idepotency_tokens::insert_idempotency_token::insert_idempotency_token;

#[derive(Debug, Deserialize)]
pub struct GoClawGenerateRequest {
  pub idempotency_token: String,
  pub agent_id: String,
  pub prompt: String,
  #[serde(default)]
  pub reference_media_tokens: Vec<MediaFileToken>,
}

#[derive(Debug, Serialize)]
pub struct GoClawGenerateResponse {
  pub content: String,
  pub media_tokens: Vec<MediaFileToken>,
}

#[derive(Debug, Serialize)]
pub struct GoClawAgentListResponse {
  pub agents: Vec<GoClawAgent>,
}

pub async fn goclaw_agents_handler(
  request: HttpRequest,
  server_state: web::Data<Arc<ServerState>>,
) -> Result<Json<GoClawAgentListResponse>, CommonWebError> {
  let mut mysql_connection = server_state.mysql_pool.acquire().await?;
  let session = require_any_session_or_key(
    &request,
    &server_state.session_checker,
    &server_state.avt_cookie_manager,
    &mut *mysql_connection,
  ).await?;
  drop(mysql_connection);

  let client = server_state.maybe_goclaw_client.as_ref()
    .ok_or_else(|| CommonWebError::server_error_with_message("GoClaw integration is not configured"))?;
  let agents = client.list_agents(session.user_token.as_str()).await.map_err(|err| {
    log::error!("GoClaw agent listing failed: {:?}", err);
    CommonWebError::server_error_with_message("Could not load GoClaw agents")
  })?;
  Ok(Json(GoClawAgentListResponse { agents }))
}

pub async fn goclaw_generate_handler(
  request: HttpRequest,
  body: Json<GoClawGenerateRequest>,
  server_state: web::Data<Arc<ServerState>>,
) -> Result<Json<GoClawGenerateResponse>, CommonWebError> {
  if body.agent_id.trim().is_empty() || body.prompt.trim().is_empty() {
    return Err(CommonWebError::BadInputWithSimpleMessage(
      "agent_id and prompt are required".to_string(),
    ));
  }

  let mut mysql_connection = server_state.mysql_pool.acquire().await?;
  let session = require_any_session_or_key(
    &request,
    &server_state.session_checker,
    &server_state.avt_cookie_manager,
    &mut *mysql_connection,
  ).await?;

  if let Err(reason) = validate_idempotency_token_format(&body.idempotency_token) {
    return Err(CommonWebError::BadInputWithSimpleMessage(reason));
  }
  insert_idempotency_token(&body.idempotency_token, &mut *mysql_connection)
    .await
    .map_err(|_| CommonWebError::BadInputWithSimpleMessage("repeated idempotency token".to_string()))?;

  if body.prompt.len() > 10_000 || body.reference_media_tokens.len() > 10 {
    return Err(CommonWebError::BadInputWithSimpleMessage(
      "prompt is too long or too many reference media files were supplied".to_string(),
    ));
  }

  let client = server_state.maybe_goclaw_client.as_ref()
    .ok_or_else(|| CommonWebError::server_error_with_message("GoClaw integration is not configured"))?;

  let resolved_media = crate::util::lookup::lookup_media_files_as_cdn_url_list_and_map::lookup_media_files_as_cdn_url_list_and_map(
    &request,
    &mut mysql_connection,
    server_state.server_environment,
    server_state.maybe_media_cdn_override_url.as_deref(),
    &body.reference_media_tokens,
  ).await?;
  drop(mysql_connection);
  let media = resolved_media.ordered_url_list.iter().map(|url| GenerationReferenceMedia {
    media_type: "image",
    url: url.as_str(),
  }).collect::<Vec<_>>();

  let generation_request = CreateGenerationRequest {
    request_id: &body.idempotency_token,
    agent_id: &body.agent_id,
    user_id: session.user_token.as_str(),
    prompt: &body.prompt,
    reference_media: &media,
  };
  let result = client.create_generation(&generation_request).await.map_err(|err| {
    log::error!("GoClaw generation failed: {:?}", err);
    CommonWebError::server_error_with_message("GoClaw generation failed")
  })?;

  if result.generation_id.trim().is_empty() || result.media.is_empty() {
    return Err(CommonWebError::server_error_with_message(
      "GoClaw did not return a generated image",
    ));
  }

  if result.media.len() > 8 {
    return Err(CommonWebError::server_error_with_message(
      "GoClaw returned too many generated files",
    ));
  }

  let ip_address = get_request_ip(&request);
  let mut media_tokens = Vec::with_capacity(result.media.len());
  for media in &result.media {
    if !media.mime_type.starts_with("image/") {
      return Err(CommonWebError::server_error_with_message(
        "GoClaw returned a non-image file for image generation",
      ));
    }
    let media_bytes = client.download_generated_media(&result.generation_id, &media.id).await.map_err(|err| {
      log::error!("Failed to download GoClaw generated media: {:?}", err);
      CommonWebError::server_error_with_message("Could not download generated media")
    })?;
    let media_token = upload_bytes_to_media_file(
      &server_state,
      &session.user_token,
      &ip_address,
      &media_bytes,
      MediaUploadKind::Image,
      "GoClaw generated image",
    ).await?;
    media_tokens.push(media_token);
  }

  Ok(Json(GoClawGenerateResponse {
    content: result.content,
    media_tokens,
  }))
}
