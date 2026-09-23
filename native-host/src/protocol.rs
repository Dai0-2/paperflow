use std::io::{self, Read, Write};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;
use uuid::Uuid;

pub const PROTOCOL_VERSION: u32 = 1;
pub const MAX_MESSAGE_BYTES: usize = 1024 * 1024;
const MAX_QUESTION_BYTES: usize = 20_000;
const MAX_CONTEXT_BYTES: usize = 180_000;
const MAX_IMAGE_BYTES: usize = 450_000;
const MAX_API_KEY_BYTES: usize = 512;
const MAX_MODEL_BYTES: usize = 128;
const MAX_URL_BYTES: usize = 2_048;

#[derive(Debug, Deserialize)]
#[serde(tag = "action", deny_unknown_fields)]
pub enum Request {
    #[serde(rename = "status")]
    Status,
    #[serde(rename = "codex.auth_status")]
    CodexAuthStatus,
    #[serde(rename = "codex.chat")]
    CodexChat {
        question: String,
        #[serde(default)]
        context: String,
        #[serde(default)]
        images: Vec<String>,
        #[serde(rename = "responseLanguage", default)]
        response_language: ResponseLanguage,
    },
    #[serde(rename = "api_key.set")]
    ApiKeySet {
        #[serde(rename = "apiKey")]
        api_key: String,
    },
    #[serde(rename = "api_key.delete")]
    ApiKeyDelete,
    #[serde(rename = "api.test")]
    ApiTest {
        #[serde(default = "default_model")]
        model: String,
        #[serde(rename = "baseUrl", default = "default_base_url")]
        base_url: String,
        #[serde(default)]
        protocol: ApiProtocol,
    },
    #[serde(rename = "api.chat")]
    ApiChat {
        question: String,
        #[serde(default)]
        context: String,
        #[serde(default)]
        images: Vec<String>,
        #[serde(default = "default_model")]
        model: String,
        #[serde(rename = "baseUrl", default = "default_base_url")]
        base_url: String,
        #[serde(default)]
        protocol: ApiProtocol,
        #[serde(rename = "responseLanguage", default)]
        response_language: ResponseLanguage,
    },
    #[serde(rename = "vault.store_device_key")]
    VaultStoreDeviceKey {
        #[serde(rename = "vaultId")]
        vault_id: Uuid,
        #[serde(rename = "vaultKey")]
        vault_key: String,
    },
    #[serde(rename = "vault.load_device_key")]
    VaultLoadDeviceKey {
        #[serde(rename = "vaultId")]
        vault_id: Uuid,
    },
    #[serde(rename = "vault.delete_device_key")]
    VaultDeleteDeviceKey {
        #[serde(rename = "vaultId")]
        vault_id: Uuid,
    },
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq)]
pub enum ResponseLanguage {
    #[serde(rename = "zh")]
    Chinese,
    #[default]
    #[serde(rename = "en")]
    English,
}

impl ResponseLanguage {
    pub fn instruction(self) -> &'static str {
        match self {
            Self::Chinese => "Chinese",
            Self::English => "English",
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq)]
pub enum ApiProtocol {
    #[default]
    #[serde(rename = "responses")]
    Responses,
    #[serde(rename = "chat-completions")]
    ChatCompletions,
}

fn default_model() -> String {
    "gpt-4.1-mini".to_owned()
}

fn default_base_url() -> String {
    "https://api.openai.com/v1".to_owned()
}

impl Request {
    pub fn validate(&self) -> Result<(), ProtocolError> {
        match self {
            Self::CodexChat {
                question,
                context,
                images,
                ..
            } => validate_chat_fields(question, context, images)?,
            Self::ApiChat {
                question,
                context,
                images,
                model,
                base_url,
                ..
            } => {
                validate_chat_fields(question, context, images)?;
                validate_api_fields(model, base_url)?;
            }
            Self::ApiKeySet { api_key } => {
                if api_key.len() < 8
                    || api_key.len() > MAX_API_KEY_BYTES
                    || api_key.chars().any(char::is_whitespace)
                {
                    return Err(ProtocolError::InvalidField(
                        "API key format is invalid.".to_owned(),
                    ));
                }
            }
            Self::VaultStoreDeviceKey { vault_key, .. } => {
                if vault_key.len() != 44 {
                    return Err(ProtocolError::InvalidField(
                        "Vault key encoding is invalid.".to_owned(),
                    ));
                }
            }
            Self::ApiTest {
                model, base_url, ..
            } => validate_api_fields(model, base_url)?,
            _ => {}
        }
        Ok(())
    }
}

fn validate_chat_fields(
    question: &str,
    context: &str,
    images: &[String],
) -> Result<(), ProtocolError> {
    if question.trim().is_empty() {
        return Err(ProtocolError::InvalidField("Question is empty.".to_owned()));
    }
    if question.len() > MAX_QUESTION_BYTES || context.len() > MAX_CONTEXT_BYTES {
        return Err(ProtocolError::InvalidField(
            "The paper context is too large.".to_owned(),
        ));
    }
    if images.len() > 2 || images.iter().any(|image| !valid_image_data_url(image)) {
        return Err(ProtocolError::InvalidField(
            "An image attachment is invalid or too large.".to_owned(),
        ));
    }
    Ok(())
}

fn valid_image_data_url(value: &str) -> bool {
    let Some((header, encoded)) = value.split_once(',') else {
        return false;
    };
    if !matches!(
        header,
        "data:image/jpeg;base64" | "data:image/png;base64" | "data:image/webp;base64"
    ) {
        return false;
    }
    STANDARD
        .decode(encoded)
        .map(|decoded| decoded.len() <= MAX_IMAGE_BYTES)
        .unwrap_or(false)
}

fn validate_api_fields(model: &str, base_url: &str) -> Result<(), ProtocolError> {
    if model.trim().is_empty()
        || model.len() > MAX_MODEL_BYTES
        || model.chars().any(char::is_control)
    {
        return Err(ProtocolError::InvalidField(
            "Model ID is invalid.".to_owned(),
        ));
    }
    if base_url.len() > MAX_URL_BYTES {
        return Err(ProtocolError::InvalidField(
            "API base URL is too long.".to_owned(),
        ));
    }
    Ok(())
}

#[derive(Debug, Serialize)]
pub struct Response {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stage: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delta: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub authenticated: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub answer: Option<String>,
    #[serde(rename = "vaultKey", skip_serializing_if = "Option::is_none")]
    pub vault_key: Option<String>,
    #[serde(rename = "protocolVersion", skip_serializing_if = "Option::is_none")]
    pub protocol_version: Option<u32>,
    #[serde(rename = "hostVersion", skip_serializing_if = "Option::is_none")]
    pub host_version: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform: Option<&'static str>,
    #[serde(rename = "codexAvailable", skip_serializing_if = "Option::is_none")]
    pub codex_available: Option<bool>,
    #[serde(
        rename = "credentialStoreAvailable",
        skip_serializing_if = "Option::is_none"
    )]
    pub credential_store_available: Option<bool>,
    #[serde(rename = "apiKeyConfigured", skip_serializing_if = "Option::is_none")]
    pub api_key_configured: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl Response {
    pub fn success() -> Self {
        Self {
            ok: true,
            event: None,
            stage: None,
            delta: None,
            authenticated: None,
            detail: None,
            answer: None,
            vault_key: None,
            protocol_version: None,
            host_version: None,
            platform: None,
            codex_available: None,
            credential_store_available: None,
            api_key_configured: None,
            error: None,
        }
    }

    pub fn error(message: impl Into<String>) -> Self {
        Self {
            ok: false,
            error: Some(message.into()),
            ..Self::success()
        }
    }

    pub fn event(kind: &'static str, stage: &'static str) -> Self {
        Self {
            event: Some(kind),
            stage: Some(stage),
            ..Self::success()
        }
    }
}

#[derive(Debug, Error)]
pub enum ProtocolError {
    #[error("Could not read the native message.")]
    Io(#[from] io::Error),
    #[error("Native message header is incomplete.")]
    IncompleteHeader,
    #[error("Request is empty.")]
    Empty,
    #[error("Request is too large.")]
    TooLarge,
    #[error("Request JSON or action schema is invalid.")]
    InvalidJson,
    #[error("{0}")]
    InvalidField(String),
}

pub fn read_request(reader: &mut impl Read) -> Result<Option<Request>, ProtocolError> {
    let mut header = [0_u8; 4];
    let first = reader.read(&mut header[..1])?;
    if first == 0 {
        return Ok(None);
    }
    if reader.read_exact(&mut header[1..]).is_err() {
        return Err(ProtocolError::IncompleteHeader);
    }
    let size = u32::from_le_bytes(header) as usize;
    if size == 0 {
        return Err(ProtocolError::Empty);
    }
    if size > MAX_MESSAGE_BYTES {
        return Err(ProtocolError::TooLarge);
    }
    let mut payload = vec![0_u8; size];
    reader.read_exact(&mut payload)?;
    let value: Value = serde_json::from_slice(&payload).map_err(|_| ProtocolError::InvalidJson)?;
    validate_object_shape(&value)?;
    let request: Request = serde_json::from_value(value).map_err(|_| ProtocolError::InvalidJson)?;
    request.validate()?;
    Ok(Some(request))
}

fn validate_object_shape(value: &Value) -> Result<(), ProtocolError> {
    let object = value.as_object().ok_or(ProtocolError::InvalidJson)?;
    let action = object
        .get("action")
        .and_then(Value::as_str)
        .ok_or(ProtocolError::InvalidJson)?;
    let allowed: &[&str] = match action {
        "status" | "codex.auth_status" | "api_key.delete" => &["action"],
        "codex.chat" => &[
            "action",
            "question",
            "context",
            "images",
            "responseLanguage",
        ],
        "api_key.set" => &["action", "apiKey"],
        "api.test" => &["action", "model", "baseUrl", "protocol"],
        "api.chat" => &[
            "action",
            "question",
            "context",
            "images",
            "model",
            "baseUrl",
            "protocol",
            "responseLanguage",
        ],
        "vault.store_device_key" => &["action", "vaultId", "vaultKey"],
        "vault.load_device_key" | "vault.delete_device_key" => &["action", "vaultId"],
        _ => return Err(ProtocolError::InvalidJson),
    };
    if object.keys().any(|key| !allowed.contains(&key.as_str())) {
        return Err(ProtocolError::InvalidJson);
    }
    Ok(())
}

pub fn write_response(writer: &mut impl Write, response: &Response) -> io::Result<()> {
    let mut payload = serde_json::to_vec(response)?;
    if payload.len() > MAX_MESSAGE_BYTES {
        payload = serde_json::to_vec(&Response::error("Response is too large."))?;
    }
    writer.write_all(&(payload.len() as u32).to_le_bytes())?;
    writer.write_all(&payload)?;
    writer.flush()
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use proptest::prelude::*;

    use super::*;

    fn frame(payload: &[u8]) -> Vec<u8> {
        let mut framed = (payload.len() as u32).to_le_bytes().to_vec();
        framed.extend_from_slice(payload);
        framed
    }

    #[test]
    fn accepts_known_action() {
        let data = frame(br#"{"action":"status"}"#);
        assert!(matches!(
            read_request(&mut Cursor::new(data)).unwrap(),
            Some(Request::Status)
        ));
    }

    #[test]
    fn rejects_unknown_action_and_fields() {
        let unknown = frame(br#"{"action":"shell.exec","command":"rm -rf /"}"#);
        assert!(read_request(&mut Cursor::new(unknown)).is_err());
        let extra = frame(br#"{"action":"status","command":"whoami"}"#);
        assert!(read_request(&mut Cursor::new(extra)).is_err());
    }

    #[test]
    fn rejects_malformed_lengths() {
        assert!(matches!(
            read_request(&mut Cursor::new(vec![1, 2, 3])),
            Err(ProtocolError::IncompleteHeader)
        ));
        let too_large = ((MAX_MESSAGE_BYTES + 1) as u32).to_le_bytes().to_vec();
        assert!(matches!(
            read_request(&mut Cursor::new(too_large)),
            Err(ProtocolError::TooLarge)
        ));
    }

    proptest! {
        #[test]
        fn arbitrary_payloads_never_panic(payload in prop::collection::vec(any::<u8>(), 0..4096)) {
            let _ = read_request(&mut Cursor::new(frame(&payload)));
        }

        #[test]
        fn arbitrary_lengths_never_panic(size in any::<u32>()) {
            let _ = read_request(&mut Cursor::new(size.to_le_bytes().to_vec()));
        }
    }
}
