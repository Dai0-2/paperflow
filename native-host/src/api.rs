use std::io::{BufRead, BufReader};
use std::sync::OnceLock;
use std::time::Duration;

use reqwest::{
    blocking::{Client, Response as HttpResponse},
    header::{AUTHORIZATION, CONTENT_TYPE, USER_AGENT},
};
use serde_json::{json, Value};
use thiserror::Error;
use url::Url;

use crate::{
    protocol::{ApiProtocol, Response, ResponseLanguage},
    secrets,
};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(300);
const POOL_IDLE_TIMEOUT: Duration = Duration::from_secs(90);
static API_CLIENT: OnceLock<Client> = OnceLock::new();

pub struct ChatRequest<'a> {
    pub question: &'a str,
    pub context: &'a str,
    pub images: &'a [String],
    pub model: &'a str,
    pub base_url: &'a str,
    pub protocol: ApiProtocol,
    pub language: ResponseLanguage,
}

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("No API key is configured.")]
    MissingKey,
    #[error("Base URL must use HTTPS. HTTP is allowed only for localhost.")]
    InvalidEndpoint,
    #[error("Could not reach the configured API endpoint.")]
    Network,
    #[error("The API rejected the request with HTTP {0}.")]
    Http(u16),
    #[error("The API returned no text.")]
    NoText,
    #[error("The operating-system credential store is unavailable.")]
    CredentialStore,
}

pub fn validate_configuration(base_url: &str, protocol: ApiProtocol) -> Result<Url, ApiError> {
    normalize_endpoint(base_url, protocol)
}

pub fn chat(request: ChatRequest<'_>, emit: &mut impl FnMut(Response)) -> Result<String, ApiError> {
    let api_key = secrets::load_api_key().map_err(|error| match error {
        secrets::SecretError::NotFound => ApiError::MissingKey,
        _ => ApiError::CredentialStore,
    })?;
    let endpoint = normalize_endpoint(request.base_url, request.protocol)?;
    let payload = build_payload(
        request.question,
        request.context,
        request.images,
        request.model,
        request.protocol,
        request.language,
    );
    let client = api_client()?;
    emit(Response::event("progress", "accepted"));
    let response = client
        .post(endpoint)
        .header(AUTHORIZATION, format!("Bearer {}", api_key.as_str()))
        .header(CONTENT_TYPE, "application/json")
        .header(USER_AGENT, "PaperFlow-AI/1.0")
        .json(&payload)
        .send()
        .map_err(|_| ApiError::Network)?;
    if !response.status().is_success() {
        return Err(ApiError::Http(response.status().as_u16()));
    }
    emit(Response::event("progress", "connected"));
    parse_response(response, request.protocol, emit)
}

fn api_client() -> Result<&'static Client, ApiError> {
    if let Some(client) = API_CLIENT.get() {
        return Ok(client);
    }
    let client = Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .pool_idle_timeout(POOL_IDLE_TIMEOUT)
        .tcp_nodelay(true)
        .build()
        .map_err(|_| ApiError::Network)?;
    let _ = API_CLIENT.set(client);
    API_CLIENT.get().ok_or(ApiError::Network)
}

fn normalize_endpoint(base_url: &str, protocol: ApiProtocol) -> Result<Url, ApiError> {
    let trimmed = base_url.trim().trim_end_matches('/');
    let mut url = Url::parse(trimmed).map_err(|_| ApiError::InvalidEndpoint)?;
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "::1"));
    if url.username() != ""
        || url.password().is_some()
        || (url.scheme() != "https" && !(url.scheme() == "http" && local))
    {
        return Err(ApiError::InvalidEndpoint);
    }
    let path = url.path().trim_end_matches('/');
    let target = match protocol {
        ApiProtocol::Responses => {
            if path.ends_with("/chat/completions") {
                path.trim_end_matches("/chat/completions").to_owned() + "/responses"
            } else if path.ends_with("/responses") {
                path.to_owned()
            } else {
                format!("{path}/responses")
            }
        }
        ApiProtocol::ChatCompletions => {
            if path.ends_with("/responses") {
                path.trim_end_matches("/responses").to_owned() + "/chat/completions"
            } else if path.ends_with("/chat/completions") {
                path.to_owned()
            } else {
                format!("{path}/chat/completions")
            }
        }
    };
    url.set_path(&target);
    url.set_query(None);
    url.set_fragment(None);
    Ok(url)
}

fn build_payload(
    question: &str,
    context: &str,
    images: &[String],
    model: &str,
    protocol: ApiProtocol,
    language: ResponseLanguage,
) -> Value {
    let prompt = format!(
        "PAPER CONTEXT\n{}\n\nUSER QUESTION\n{}",
        if context.is_empty() {
            "[No extracted paper text available]"
        } else {
            context
        },
        question
    );
    let instructions = format!(
        "You are PaperFlow, a precise research-paper reading assistant. Use only the supplied \
context, say when it is insufficient, answer in {}, and use Markdown. Cite factual claims \
from the supplied paper as [Page N]. Never invent page numbers. For math, use only $...$ \
for inline formulas and $$...$$ for display formulas; never wrap formulas in plain brackets.",
        language.instruction()
    );
    match protocol {
        ApiProtocol::Responses => {
            let mut content = vec![json!({ "type": "input_text", "text": prompt })];
            content.extend(
                images
                    .iter()
                    .map(|image| json!({ "type": "input_image", "image_url": image })),
            );
            json!({
                "model": model,
                "instructions": instructions,
                "input": [{ "role": "user", "content": content }],
                "store": false,
                "stream": true
            })
        }
        ApiProtocol::ChatCompletions => {
            let mut content = vec![json!({ "type": "text", "text": prompt })];
            content.extend(
                images
                    .iter()
                    .map(|image| json!({ "type": "image_url", "image_url": { "url": image } })),
            );
            json!({
                "model": model,
                "messages": [
                    { "role": "system", "content": instructions },
                    { "role": "user", "content": content }
                ],
                "stream": true
            })
        }
    }
}

fn parse_response(
    response: HttpResponse,
    protocol: ApiProtocol,
    emit: &mut impl FnMut(Response),
) -> Result<String, ApiError> {
    let mut answer = String::new();
    let mut non_sse = String::new();
    for line in BufReader::new(response).lines().map_while(Result::ok) {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Some(data) = trimmed.strip_prefix("data:") else {
            non_sse.push_str(trimmed);
            continue;
        };
        let data = data.trim();
        if data == "[DONE]" {
            continue;
        }
        let Ok(event) = serde_json::from_str::<Value>(data) else {
            continue;
        };
        let delta = match protocol {
            ApiProtocol::Responses => {
                if event.get("type").and_then(Value::as_str) == Some("response.output_text.delta") {
                    event.get("delta").and_then(Value::as_str)
                } else {
                    None
                }
            }
            ApiProtocol::ChatCompletions => event
                .pointer("/choices/0/delta/content")
                .and_then(Value::as_str),
        };
        if let Some(delta) = delta.filter(|value| !value.is_empty()) {
            answer.push_str(delta);
            let mut event = Response::event("delta", "writing");
            event.delta = Some(delta.to_owned());
            emit(event);
        }
    }
    if !answer.trim().is_empty() {
        return Ok(answer.trim().to_owned());
    }
    let payload: Value = serde_json::from_str(&non_sse).unwrap_or(Value::Null);
    let fallback = match protocol {
        ApiProtocol::Responses => extract_responses_text(&payload),
        ApiProtocol::ChatCompletions => payload
            .pointer("/choices/0/message/content")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim()
            .to_owned(),
    };
    if fallback.is_empty() {
        Err(ApiError::NoText)
    } else {
        Ok(fallback)
    }
}

fn extract_responses_text(payload: &Value) -> String {
    if let Some(text) = payload.get("output_text").and_then(Value::as_str) {
        return text.trim().to_owned();
    }
    payload
        .get("output")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .flat_map(|item| {
            item.get("content")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
        })
        .filter(|content| content.get("type").and_then(Value::as_str) == Some("output_text"))
        .filter_map(|content| content.get("text").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoint_requires_https_except_loopback() {
        assert!(normalize_endpoint("http://example.com/v1", ApiProtocol::Responses).is_err());
        assert_eq!(
            normalize_endpoint("http://localhost:8080/v1", ApiProtocol::Responses)
                .unwrap()
                .as_str(),
            "http://localhost:8080/v1/responses"
        );
    }

    #[test]
    fn endpoint_normalization_replaces_known_suffixes() {
        assert_eq!(
            normalize_endpoint(
                "https://api.example.com/v1/chat/completions",
                ApiProtocol::Responses
            )
            .unwrap()
            .as_str(),
            "https://api.example.com/v1/responses"
        );
        assert_eq!(
            normalize_endpoint(
                "https://api.example.com/v1/responses",
                ApiProtocol::ChatCompletions
            )
            .unwrap()
            .as_str(),
            "https://api.example.com/v1/chat/completions"
        );
    }

    #[test]
    fn api_payload_never_requests_server_storage() {
        let payload = build_payload(
            "question",
            "context",
            &[],
            "model",
            ApiProtocol::Responses,
            ResponseLanguage::English,
        );
        assert_eq!(payload["store"], false);
        assert!(payload["instructions"]
            .as_str()
            .is_some_and(|value| value.contains("$$...$$")));
    }
}
