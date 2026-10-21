use std::sync::Arc;

use actix_web::{web, HttpRequest};
use actix_web::web::Json;
use goclaw_client::{GoClawAgent, GoClawClient};
use http_server_common::request::get_request_ip::get_request_ip;
use serde::{Deserialize, Serialize};
use tokens::tokens::media_files::MediaFileToken;
use utoipa::ToSchema;

use crate::http_server::common_responses::common_web_error::CommonWebError;
use crate::http_server::endpoints::omni_api::shared_utils::media_uploads::upload_url_to_media_file::{
  upload_bytes_to_media_file, MediaUploadKind,
};
use crate::http_server::user_lookup::api_or_web_session::require_any_session_or_key::require_any_session_or_key;
use crate::http_server::validations::validate_idempotency_token_format::validate_idempotency_token_format;
use crate::state::server_state::ServerState;
use mysql_queries::queries::idepotency_tokens::insert_idempotency_token::insert_idempotency_token;

#[derive(Deserialize, ToSchema)]
pub struct GoClawConnectionRequest {
  pub goclaw_url: String,
  pub goclaw_api_token: String,
}

#[derive(Deserialize, ToSchema)]
pub struct GoClawGenerateRequest {
  pub idempotency_token: String,
  pub goclaw_url: String,
  pub goclaw_api_token: String,
  pub agent_id: String,
  pub prompt: String,
  #[serde(default)]
  pub reference_media_tokens: Vec<MediaFileToken>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct GoClawGenerateResponse {
  pub content: String,
  pub media_tokens: Vec<MediaFileToken>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct GoClawAgentListResponse {
  pub agents: Vec<GoClawAgentInfo>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct GoClawAgentInfo {
  pub id: String,
  pub name: String,
  pub description: String,
}

pub async fn goclaw_agents_handler(
  request: HttpRequest,
  body: Json<GoClawConnectionRequest>,
  server_state: web::Data<Arc<ServerState>>,
) -> Result<Json<GoClawAgentListResponse>, CommonWebError> {
  authenticate(&request, &server_state).await?;
  let client = make_client(&body.goclaw_url, &body.goclaw_api_token)?;
  let agents = client.list_agents().await.map_err(|err| {
    log::error!("GoClaw agent listing failed: {:?}", err);
    CommonWebError::BadInputWithSimpleMessage("Could not connect to GoClaw or load its agents".to_string())
  })?.into_iter().map(|agent: GoClawAgent| GoClawAgentInfo {
    id: agent.id,
    name: agent.name,
    description: agent.description,
  }).collect();
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
  if body.prompt.len() > 10_000 || body.reference_media_tokens.len() > 10 {
    return Err(CommonWebError::BadInputWithSimpleMessage(
      "prompt is too long or too many reference media files were supplied".to_string(),
    ));
  }
  let client = make_client(&body.goclaw_url, &body.goclaw_api_token)?;

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

  let resolved_media = crate::util::lookup::lookup_media_files_as_cdn_url_list_and_map::lookup_media_files_as_cdn_url_list_and_map(
    &request,
    &mut mysql_connection,
    server_state.server_environment,
    server_state.maybe_media_cdn_override_url.as_deref(),
    &body.reference_media_tokens,
  ).await?;
  drop(mysql_connection);

  let mut message = format!(
    "Generate one image for this request: {}\n\nWhen finished, return every generated image as a Markdown image link using a file URL served by this GoClaw instance (for example ![generated image](https://YOUR-GOCLAW/v1/files/FILE_ID)). Do not return base64 data or links to a different host.",
    body.prompt.trim(),
  );
  if !resolved_media.ordered_url_list.is_empty() {
    message.push_str("\n\nUse these reference images as visual input:\n");
    for (index, url) in resolved_media.ordered_url_list.iter().enumerate() {
      message.push_str(&format!("{}. {}\n", index + 1, url));
    }
  }

  let session_key = format!("artcraft:{}", body.idempotency_token);
  let content = client.wake_agent(
    &body.agent_id,
    &session_key,
    &message,
  ).await.map_err(|err| {
    log::error!("GoClaw agent wake failed: {:?}", err);
    CommonWebError::server_error_with_message("GoClaw agent generation failed")
  })?;
  let image_urls = extract_markdown_image_urls(&content);
  if image_urls.is_empty() || image_urls.len() > 8 {
    return Err(CommonWebError::server_error_with_message(
      "GoClaw agent did not return a supported image link",
    ));
  }

  let ip_address = get_request_ip(&request);
  let mut media_tokens = Vec::with_capacity(image_urls.len());
  for image_url in image_urls {
    let media_bytes = client.download_generated_media(&image_url).await.map_err(|err| {
      log::error!("Could not import generated GoClaw image: {:?}", err);
      CommonWebError::server_error_with_message("Could not import generated image from GoClaw")
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

  Ok(Json(GoClawGenerateResponse { content, media_tokens }))
}

async fn authenticate(
  request: &HttpRequest,
  server_state: &ServerState,
) -> Result<(), CommonWebError> {
  let mut mysql_connection = server_state.mysql_pool.acquire().await?;
  require_any_session_or_key(
    request,
    &server_state.session_checker,
    &server_state.avt_cookie_manager,
    &mut *mysql_connection,
  ).await?;
  Ok(())
}

fn make_client(url: &str, token: &str) -> Result<GoClawClient, CommonWebError> {
  GoClawClient::new(url, token.to_string()).map_err(|_| {
    CommonWebError::BadInputWithSimpleMessage(
      "Enter a valid public GoClaw URL using HTTPS and a valid API token".to_string(),
    )
  })
}

fn extract_markdown_image_urls(content: &str) -> Vec<String> {
  let mut urls = Vec::new();
  let mut rest = content;
  while let Some(start) = rest.find("](") {
    let is_image = start > 0 && rest.as_bytes()[start - 1] == b'!';
    rest = &rest[start + 2..];
    let Some(end) = rest.find(')') else { break };
    let candidate = rest[..end].trim().trim_start_matches('<').trim_end_matches('>');
    if is_image && candidate.starts_with("https://") && !urls.iter().any(|url| url == candidate) {
      urls.push(candidate.to_string());
    }
    rest = &rest[end + 1..];
  }
  urls
}

#[cfg(test)]
mod tests {
  use super::extract_markdown_image_urls;

  #[test]
  fn extracts_unique_https_markdown_images_only() {
    let urls = extract_markdown_image_urls(
      "[link](https://example.com/not-image) ![one](https://goclaw.example/v1/files/one.png) ![same](https://goclaw.example/v1/files/one.png) ![two](http://example/two.png)",
    );
    assert_eq!(urls, vec!["https://goclaw.example/v1/files/one.png".to_string()]);
  }
}
