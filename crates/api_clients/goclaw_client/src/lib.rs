use std::net::{IpAddr, SocketAddr};

use anyhow::{Context, anyhow};
use bytes::{Bytes, BytesMut};
use reqwest::{header::AUTHORIZATION, redirect::Policy};
use serde::{Deserialize, Serialize};
use url::Url;

const AGENTS_PATH: &str = "/v1/agents";
const MAX_GENERATED_FILE_SIZE_BYTES: u64 = 100 * 1024 * 1024;
const REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10 * 60);

#[derive(Clone)]
pub struct GoClawClient {
  base_url: Url,
  bearer_token: String,
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

#[derive(Debug, Serialize)]
struct WakeAgentRequest<'a> {
  message: &'a str,
  session_key: &'a str,
}

#[derive(Debug, Deserialize)]
struct WakeAgentResponse {
  #[serde(default)]
  content: String,
}

impl GoClawClient {
  pub fn new(base_url: &str, bearer_token: String) -> anyhow::Result<Self> {
    if base_url.len() > 2_048 || bearer_token.len() > 4_096
      || bearer_token.bytes().any(|byte| !byte.is_ascii() || byte.is_ascii_control())
    {
      return Err(anyhow!("GoClaw URL or API token exceeds the allowed format"));
    }
    let mut base_url = Url::parse(base_url).context("invalid GoClaw URL")?;
    if base_url.scheme() != "https" {
      return Err(anyhow!("GoClaw URL must use HTTPS"));
    }
    if base_url.host().is_none() || !base_url.username().is_empty() || base_url.password().is_some() {
      return Err(anyhow!("GoClaw URL must include a public host without embedded credentials"));
    }
    if base_url.query().is_some() || base_url.fragment().is_some() {
      return Err(anyhow!("GoClaw URL must not contain a query or fragment"));
    }
    if bearer_token.trim().is_empty() {
      return Err(anyhow!("GoClaw API token is required"));
    }
    base_url.set_path("");
    Ok(Self { base_url, bearer_token })
  }

  pub async fn list_agents(&self) -> anyhow::Result<Vec<GoClawAgent>> {
    let (client, url) = self.request_client(AGENTS_PATH).await?;
    let response = self.authorized(client.get(url)).send().await
      .context("GoClaw agent list request failed")?;
    let response = ensure_success(response, "agent list request").await?;
    let agent_list: GoClawAgentList = response.json().await
      .context("invalid GoClaw agent list response")?;
    Ok(agent_list.agents)
  }

  pub async fn wake_agent(&self, agent_id: &str, session_key: &str, message: &str) -> anyhow::Result<String> {
    if agent_id.trim().is_empty() || message.trim().is_empty() {
      return Err(anyhow!("agent_id and message must be non-empty"));
    }
    let mut endpoint = self.base_url.clone();
    endpoint.path_segments_mut().map_err(|_| anyhow!("invalid GoClaw URL"))?
      .push("v1").push("agents").push(agent_id).push("wake");
    let (client, endpoint) = self.request_client(endpoint.path()).await?;
    let response = self.authorized(client.post(endpoint))
      .json(&WakeAgentRequest { message, session_key })
      .send().await.context("GoClaw wake request failed")?;
    let response = ensure_success(response, "wake request").await?;
    let result: WakeAgentResponse = response.json().await
      .context("invalid GoClaw wake response")?;
    Ok(result.content)
  }

  pub async fn download_generated_media(&self, media_url: &str) -> anyhow::Result<Bytes> {
    let media_url = Url::parse(media_url).context("invalid generated media URL")?;
    if media_url.origin() != self.base_url.origin()
      || !(media_url.path().starts_with("/v1/files/") || media_url.path().starts_with("/v1/media/"))
      || media_url.query().is_some()
      || !media_url.username().is_empty()
      || media_url.password().is_some()
    {
      return Err(anyhow!("GoClaw image links must use this GoClaw server's file or media endpoint"));
    }
    let (client, url) = self.request_client(media_url.path()).await?;
    let response = self.authorized(client.get(url)).send().await
      .context("GoClaw generated media download failed")?;
    let mut response = ensure_success(response, "generated media download").await?;
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

  async fn request_client(&self, path: &str) -> anyhow::Result<(reqwest::Client, Url)> {
    let host = self.base_url.host_str().ok_or_else(|| anyhow!("GoClaw URL has no host"))?;
    let port = self.base_url.port_or_known_default().ok_or_else(|| anyhow!("GoClaw URL has no port"))?;
    let literal_ip = host.trim_start_matches('[').trim_end_matches(']').parse::<IpAddr>();
    let is_literal_ip = literal_ip.is_ok();
    let addresses = match literal_ip {
      Ok(ip) => vec![SocketAddr::new(ip, port)],
      Err(_) => tokio::net::lookup_host((host, port)).await
        .context("could not resolve GoClaw host")?.collect::<Vec<_>>(),
    };
    if addresses.is_empty() || addresses.iter().any(|address| !is_public_ip(address.ip())) {
      return Err(anyhow!("GoClaw URL must resolve only to public IP addresses"));
    }
    let mut builder = reqwest::Client::builder()
      .timeout(REQUEST_TIMEOUT)
      .connect_timeout(std::time::Duration::from_secs(15))
      .redirect(Policy::none())
      .no_proxy();
    if !is_literal_ip {
      builder = builder.resolve_to_addrs(host, &addresses);
    }
    let client = builder.build().context("failed to build GoClaw HTTP client")?;
    let mut endpoint = self.base_url.clone();
    endpoint.set_path(path);
    endpoint.set_query(None);
    endpoint.set_fragment(None);
    Ok((client, endpoint))
  }

  fn authorized(&self, request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    request.header(AUTHORIZATION, format!("Bearer {}", self.bearer_token))
  }
}

async fn ensure_success(response: reqwest::Response, operation: &str) -> anyhow::Result<reqwest::Response> {
  if response.status().is_success() {
    return Ok(response);
  }
  let status = response.status();
  // Do not include the remote response body: it may contain sensitive data.
  Err(anyhow!("GoClaw {operation} returned {status}"))
}

fn is_public_ip(ip: IpAddr) -> bool {
  match ip {
    IpAddr::V4(ip) => {
      let [a, b, c, _] = ip.octets();
      !(ip.is_private() || ip.is_loopback() || ip.is_link_local() || ip.is_multicast()
        || ip.is_unspecified() || ip.is_broadcast() || a == 0 || a >= 240
        || (a == 100 && (64..=127).contains(&b))
        || (a == 192 && b == 0 && c == 0)
        || (a == 192 && b == 0 && c == 2)
        || (a == 198 && (b == 18 || b == 19))
        || (a == 198 && b == 51 && c == 100)
        || (a == 203 && b == 0 && c == 113))
    }
    IpAddr::V6(ip) => {
      if let Some(mapped) = ip.to_ipv4_mapped() {
        return is_public_ip(IpAddr::V4(mapped));
      }
      let segments = ip.segments();
      (segments[0] & 0xe000) == 0x2000 && !ip.is_loopback() && !ip.is_unspecified()
        && !(segments[0] == 0x2001 && segments[1] == 0x0db8)
        && !(segments[0] == 0x2001 && segments[1] == 0x0002)
        && !(segments[0] == 0x2001 && segments[1] <= 0x01ff)
        && segments[0] != 0x2002
        && segments[0] != 0x3fff
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn only_accepts_https_and_nonempty_credentials() {
    assert!(GoClawClient::new("http://example.com", "token".to_string()).is_err());
    assert!(GoClawClient::new("https://example.com", " ".to_string()).is_err());
    assert!(GoClawClient::new("https://example.com", "token".to_string()).is_ok());
  }

  #[test]
  fn blocks_private_ip_addresses() {
    for ip in ["127.0.0.1", "10.0.0.1", "192.168.1.1", "169.254.1.2", "100.64.0.1", "::1", "fc00::1"] {
      assert!(!is_public_ip(ip.parse().unwrap()), "{ip} should be rejected");
    }
    assert!(is_public_ip("8.8.8.8".parse().unwrap()));
    assert!(is_public_ip("2606:4700:4700::1111".parse().unwrap()));
  }

  #[test]
  fn wake_request_uses_native_message_and_session_fields() {
    let json = serde_json::to_value(WakeAgentRequest {
      message: "Generate an image",
      session_key: "artcraft:request-1",
    }).unwrap();
    assert_eq!(json["message"], "Generate an image");
    assert_eq!(json["session_key"], "artcraft:request-1");
  }
}
