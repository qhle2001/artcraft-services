use crate::http_server::common_responses::media::media_domain::MediaDomain;
use domains::Domain;
use domains::fakeyou::{FAKEYOU_CDN, FAKEYOU_DEV_CDN};
use server_environment::ServerEnvironment;
use url::Url;

// NB: Storyteller media is served from the FakeYou CDN too.
const FAKEYOU_PRODUCTION: Domain = FAKEYOU_CDN;
const STORYTELLER_PRODUCTION: Domain = FAKEYOU_CDN;

const FAKEYOU_DEVELOPMENT: Domain = FAKEYOU_DEV_CDN;
const STORYTELLER_DEVELOPMENT: Domain = FAKEYOU_DEV_CDN;

// TODO(bt,2025-01-31): Perhaps this should be config driven and configurable at runtime instead of hardcoded.
pub fn get_cdn_host(media_domain: MediaDomain, server_environment: ServerEnvironment) -> String {
  let mut url = cdn_url(media_domain, server_environment);
  url.set_path("");
  url.to_string().trim_end_matches('/').to_string()
}

pub fn new_cdn_url(media_domain: MediaDomain, server_environment: ServerEnvironment) -> Url {
  cdn_url(media_domain, server_environment)
}

pub fn has_custom_media_cdn() -> bool {
  std::env::var("MEDIA_CDN_BASE_URL")
    .map(|value| !value.trim().is_empty())
    .unwrap_or(false)
}

fn cdn_url(media_domain: MediaDomain, server_environment: ServerEnvironment) -> Url {
  match std::env::var("MEDIA_CDN_BASE_URL") {
    Ok(value) => {
      let mut url = Url::parse(value.trim())
        .expect("MEDIA_CDN_BASE_URL must be a valid HTTPS origin");
      assert!(
        url.scheme() == "https"
          && url.host_str().is_some()
          && url.username().is_empty()
          && url.password().is_none()
          && url.path() == "/"
          && url.query().is_none()
          && url.fragment().is_none(),
        "MEDIA_CDN_BASE_URL must be an HTTPS origin without credentials, path, query, or fragment",
      );
      url.set_path("");
      url
    }
    Err(_) => cdn_domain(media_domain, server_environment).https_url().clone(),
  }
}

fn cdn_domain(media_domain: MediaDomain, server_environment: ServerEnvironment) -> Domain {
  match (media_domain, server_environment) {
    (MediaDomain::FakeYou, ServerEnvironment::Development) => FAKEYOU_DEVELOPMENT,
    (MediaDomain::FakeYou, ServerEnvironment::Production) => FAKEYOU_PRODUCTION,
    (MediaDomain::Storyteller, ServerEnvironment::Development) => STORYTELLER_DEVELOPMENT,
    (MediaDomain::Storyteller, ServerEnvironment::Production) => STORYTELLER_PRODUCTION,
  }
}

#[cfg(test)]
mod tests {
  use crate::http_server::common_responses::media::cdn_link::{get_cdn_host, new_cdn_url};
  use crate::http_server::common_responses::media::media_domain::MediaDomain;
  use server_environment::ServerEnvironment;

  const PROD_CDN: &str = "https://cdn-2.fakeyou.com";
  const DEV_CDN: &str = "https://pub-c8a4a5bdbdb048f286b77bdf9f786ff2.r2.dev";

  #[test]
  fn cdn_hosts() {
    assert_eq!(get_cdn_host(MediaDomain::FakeYou, ServerEnvironment::Production), PROD_CDN);
    assert_eq!(get_cdn_host(MediaDomain::Storyteller, ServerEnvironment::Production), PROD_CDN);
    assert_eq!(get_cdn_host(MediaDomain::FakeYou, ServerEnvironment::Development), DEV_CDN);
    assert_eq!(get_cdn_host(MediaDomain::Storyteller, ServerEnvironment::Development), DEV_CDN);
  }

  #[test]
  fn cdn_urls() {
    assert_eq!(new_cdn_url(MediaDomain::FakeYou, ServerEnvironment::Production).as_str(), "https://cdn-2.fakeyou.com/");
    assert_eq!(new_cdn_url(MediaDomain::Storyteller, ServerEnvironment::Production).as_str(), "https://cdn-2.fakeyou.com/");
    assert_eq!(new_cdn_url(MediaDomain::FakeYou, ServerEnvironment::Development).as_str(), "https://pub-c8a4a5bdbdb048f286b77bdf9f786ff2.r2.dev/");
    assert_eq!(new_cdn_url(MediaDomain::Storyteller, ServerEnvironment::Development).as_str(), "https://pub-c8a4a5bdbdb048f286b77bdf9f786ff2.r2.dev/");
  }
}
