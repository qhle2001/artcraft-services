use anyhow::{Context, anyhow};
use bytes::{Bytes, BytesMut};
use reqwest::header::AUTHORIZATION;
use serde::{Deserialize, Serialize};
use url::Url;

const GENERATIONS_PATH: &str = "/v1/generations";
const AGENTS_PATH: &str = "/v1/agents";
const MAX_GENERATED_FILE_SIZE_BYTES: u64 = 100 * 1024 * 1024;

#[derive(Clone)]
pub struct GoClawClient {
  base_url: Url,
  bearer_token: String,
  http_client: reqwest::Client,
}

#[derive(Debug, Clone, Serialize)]
pub struct GenerationReferenceMedia<'a> {
  #[serde(rename = "type")]
  pub media_type: &'a str,
  pub url: &'a str,
}

#[derive(Debug, Serialize)]
pub struct CreateGenerationRequest<'a> {
  pub request_id: &'a str,
  pub agent_id: &'a str,
  pub user_id: &'a str,
  pub prompt: &'a str,
  pub reference_media: &'a [GenerationReferenceMedia<'a>],
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct GenerationResult {
  pub generation_id: String,
  #[serde(default)]
  pub content: String,
  #[serde(default)]
  pub media: Vec<GeneratedMedia>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct GeneratedMedia {
  pub id: String,
  pub mime_type: String,
  #[serde(default)]
  pub file_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct GoClawAgent {
  pub id: String,
  pub name: String,
  #[serde(default)]
  pub description: String,
}

#[derive(Debug, Deserialize)]
struct GoClawAgentList {
  agents: Vec<GoClawAgent>,
}

impl GoClawClient {
  pub fn new(base_url: &str, bearer_token: String) -> anyhow::Result<Self> {
    let mut base_url = Url::parse(base_url).context("invalid GoClaw generation service URL")?;
    if !matches!(base_url.scheme(), "http" | "https") {
      return Err(anyhow!("GoClaw generation service URL must use http or https"));
    }
    base_url.set_path("");
    base_url.set_query(None);
    base_url.set_fragment(None);

    let http_client = reqwest::Client::builder()
      .timeout(std::time::Duration::from_secs(10 * 60))
      .build()
      .context("failed to build GoClaw generation service client")?;

    Ok(Self { base_url, bearer_token, http_client })
  }

  pub async fn create_generation(
    &self,
    request: &CreateGenerationRequest<'_>,
  ) -> anyhow::Result<GenerationResult> {
    if request.request_id.trim().is_empty()
      || request.agent_id.trim().is_empty()
      || request.user_id.trim().is_empty()
      || request.prompt.trim().is_empty()
    {
      return Err(anyhow!("request_id, agent_id, user_id and prompt must be non-empty"));
    }

    let endpoint = self.base_url.join(GENERATIONS_PATH)?;
    let response = self.authorized(self.http_client.post(endpoint))
      .json(request)
      .send()
      .await
      .context("GoClaw generation request failed")?;
    let response = self.ensure_success(response, "generation request").await?;
    response.json().await.context("invalid GoClaw generation response")
  }

  pub async fn list_agents(&self, user_id: &str) -> anyhow::Result<Vec<GoClawAgent>> {
    if user_id.trim().is_empty() {
      return Err(anyhow!("user_id must be non-empty"));
    }
    let endpoint = self.base_url.join(AGENTS_PATH)?;
    let response = self.authorized(self.http_client.get(endpoint))
      .header("X-GoClaw-User-Id", user_id)
      .send()
      .await
      .context("GoClaw agent list request failed")?;
    let response = self.ensure_success(response, "agent list request").await?;
    let agent_list: GoClawAgentList = response.json().await
      .context("invalid GoClaw agent list response")?;
    Ok(agent_list.agents)
  }

  pub async fn download_generated_media(
    &self,
    generation_id: &str,
    media_id: &str,
  ) -> anyhow::Result<Bytes> {
    if generation_id.trim().is_empty() || media_id.trim().is_empty() {
      return Err(anyhow!("generation_id and media_id must be non-empty"));
    }

    let mut endpoint = self.base_url.join("/v1/generations/")?;
    endpoint.path_segments_mut()
      .map_err(|_| anyhow!("invalid GoClaw generation service URL"))?
      .push(generation_id)
      .push("media")
      .push(media_id);

    let response = self.authorized(self.http_client.get(endpoint))
      .send()
      .await
      .context("GoClaw generated media download failed")?;
    let mut response = self.ensure_success(response, "generated media download").await?;
    if response.content_length().is_some_and(|size| size > MAX_GENERATED_FILE_SIZE_BYTES) {
      return Err(anyhow!("GoClaw generated file exceeds the size limit"));
    }

    let mut downloaded = BytesMut::new();
    while let Some(chunk) = response.chunk().await.context("GoClaw generated media download failed")? {
      if downloaded.len() as u64 + chunk.len() as u64 > MAX_GENERATED_FILE_SIZE_BYTES {
        return Err(anyhow!("GoClaw generated file exceeds the size limit"));
      }
      downloaded.extend_from_slice(&chunk);
    }
    Ok(downloaded.freeze())
  }

  fn authorized(&self, request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    request.header(AUTHORIZATION, format!("Bearer {}", self.bearer_token))
  }

  async fn ensure_success(
    &self,
    response: reqwest::Response,
    operation: &str,
  ) -> anyhow::Result<reqwest::Response> {
    if response.status().is_success() {
      return Ok(response);
    }
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    Err(anyhow!("GoClaw {operation} returned {status}: {body}"))
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn rejects_non_http_service_urls() {
    assert!(GoClawClient::new("ws://localhost:8080", "token".to_string()).is_err());
  }

  #[test]
  fn generation_request_has_expected_agent_and_reference_contract() {
    let reference = GenerationReferenceMedia { media_type: "image", url: "https://cdn.example/image.png" };
    let references = [reference];
    let request = CreateGenerationRequest {
      request_id: "request-1",
      agent_id: "image-agent",
      user_id: "user-1",
      prompt: "A fox",
      reference_media: &references,
    };
    let json = serde_json::to_value(request).unwrap();
    assert_eq!(json["agent_id"], "image-agent");
    assert_eq!(json["reference_media"][0]["type"], "image");
  }
}
