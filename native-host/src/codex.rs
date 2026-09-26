use std::{
    fs::File,
    io::{BufRead, BufReader, Read},
    path::PathBuf,
    process::{Command, Stdio},
    sync::OnceLock,
    thread,
    time::{Duration, Instant},
};

use base64::{
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
    Engine as _,
};
use reqwest::{
    blocking::{Client, Response as HttpResponse},
    header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, CONTENT_TYPE, USER_AGENT},
    StatusCode,
};
use serde::Deserialize;
use serde_json::{json, Value};
use thiserror::Error;
use zeroize::Zeroizing;

use crate::protocol::{Response, ResponseLanguage};

const CODEX_RESPONSES_URL: &str = "https://chatgpt.com/backend-api/codex/responses";
const CODEX_MODELS_URL: &str = "https://chatgpt.com/backend-api/codex/models?client_version=1.0.0";
const CODEX_USER_AGENT: &str = "codex_cli_rs/0.0.0 (PaperFlow)";
const CODEX_TIMEOUT: Duration = Duration::from_secs(300);
const CREDENTIAL_REFRESH_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_AUTH_FILE_BYTES: u64 = 1_048_576;
const MAX_IMAGE_BYTES: usize = 400_000;
const MAX_NON_SSE_BYTES: usize = 1_048_576;

static CODEX_CLIENT: OnceLock<Client> = OnceLock::new();

#[derive(Debug, Error)]
pub enum CodexError {
    #[error("Codex CLI was not found. Install and sign in to the official Codex CLI first.")]
    NotFound,
    #[error("Codex CLI could not be started.")]
    Start,
    #[error("Codex CLI timed out.")]
    Timeout,
    #[error("ChatGPT subscription credentials were not found. Run `codex login` first.")]
    MissingCredentials,
    #[error("ChatGPT subscription credentials are invalid. Run `codex login` again.")]
    InvalidCredentials,
    #[error("ChatGPT subscription authentication expired. Run `codex login` again.")]
    AuthenticationExpired,
    #[error(
        "Could not reach the ChatGPT subscription service. Check the network or proxy settings."
    )]
    Network,
    #[error("The ChatGPT subscription rate limit or usage limit was reached.")]
    RateLimited,
    #[error("The ChatGPT subscription service is temporarily unavailable (HTTP {0}).")]
    ServiceUnavailable(u16),
    #[error("ChatGPT rejected the request (HTTP {0}).")]
    Rejected(u16),
    #[error("Could not determine an available Codex model.")]
    NoModel,
    #[error("An attached image is invalid or too large.")]
    InvalidImage,
    #[error("Codex did not return an answer.")]
    NoAnswer,
}

#[derive(Deserialize)]
struct AuthFile {
    tokens: Option<AuthTokens>,
}

#[derive(Deserialize)]
struct AuthTokens {
    access_token: Zeroizing<String>,
    #[serde(default)]
    account_id: Option<Zeroizing<String>>,
}

struct Credentials {
    access_token: Zeroizing<String>,
    account_id: Zeroizing<String>,
}

enum RequestError {
    Unauthorized,
    Public(CodexError),
}

impl From<CodexError> for RequestError {
    fn from(error: CodexError) -> Self {
        Self::Public(error)
    }
}

#[derive(Default)]
struct StreamState {
    answer: String,
    fallback: Option<String>,
}

pub fn find_executable() -> Option<PathBuf> {
    fixed_candidates()
        .into_iter()
        .find(|path| path.is_file())
        .or_else(|| which::which(executable_name()).ok())
}

pub fn is_available() -> bool {
    find_executable().is_some() || read_credentials().is_ok()
}

fn executable_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "codex.exe"
    } else {
        "codex"
    }
}

fn fixed_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if cfg!(target_os = "macos") {
        candidates.push(PathBuf::from(
            "/Applications/ChatGPT.app/Contents/Resources/codex",
        ));
        candidates.push(PathBuf::from("/opt/homebrew/bin/codex"));
        candidates.push(PathBuf::from("/usr/local/bin/codex"));
    }
    if let Some(home) = home_dir() {
        candidates.push(
            home.join(".codex")
                .join("plugins")
                .join(".plugin-appserver")
                .join(executable_name()),
        );
        candidates.push(home.join(".local").join("bin").join(executable_name()));
    }
    if cfg!(target_os = "windows") {
        if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
            candidates.push(
                PathBuf::from(local_app_data)
                    .join("Programs")
                    .join("Codex")
                    .join("codex.exe"),
            );
        }
        if let Some(app_data) = std::env::var_os("APPDATA") {
            candidates.push(PathBuf::from(app_data).join("npm").join("codex.cmd"));
        }
    }
    candidates
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os(if cfg!(target_os = "windows") {
        "USERPROFILE"
    } else {
        "HOME"
    })
    .map(PathBuf::from)
}

fn auth_path() -> Option<PathBuf> {
    std::env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .or_else(|| home_dir().map(|home| home.join(".codex")))
        .map(|home| home.join("auth.json"))
}

fn read_credentials() -> Result<Credentials, CodexError> {
    let path = auth_path().ok_or(CodexError::MissingCredentials)?;
    let file = File::open(path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            CodexError::MissingCredentials
        } else {
            CodexError::InvalidCredentials
        }
    })?;
    if file
        .metadata()
        .map_err(|_| CodexError::InvalidCredentials)?
        .len()
        > MAX_AUTH_FILE_BYTES
    {
        return Err(CodexError::InvalidCredentials);
    }
    let mut raw = Zeroizing::new(Vec::new());
    file.take(MAX_AUTH_FILE_BYTES + 1)
        .read_to_end(&mut raw)
        .map_err(|_| CodexError::InvalidCredentials)?;
    if raw.len() as u64 > MAX_AUTH_FILE_BYTES {
        return Err(CodexError::InvalidCredentials);
    }
    let auth: AuthFile =
        serde_json::from_slice(&raw).map_err(|_| CodexError::InvalidCredentials)?;
    let tokens = auth.tokens.ok_or(CodexError::MissingCredentials)?;
    if tokens.access_token.trim().is_empty() {
        return Err(CodexError::InvalidCredentials);
    }
    let account_id = tokens
        .account_id
        .filter(|value| !value.trim().is_empty())
        .or_else(|| account_id_from_access_token(&tokens.access_token))
        .ok_or(CodexError::InvalidCredentials)?;
    Ok(Credentials {
        access_token: tokens.access_token,
        account_id,
    })
}

fn account_id_from_access_token(access_token: &str) -> Option<Zeroizing<String>> {
    let payload = access_token.split('.').nth(1)?.trim_end_matches('=');
    let decoded = Zeroizing::new(URL_SAFE_NO_PAD.decode(payload).ok()?);
    let claims: Value = serde_json::from_slice(&decoded).ok()?;
    let account_id = claims
        .get("https://api.openai.com/auth")
        .and_then(|auth| auth.get("chatgpt_account_id"))
        .and_then(Value::as_str)
        .or_else(|| {
            claims
                .get("https://api.openai.com/auth.chatgpt_account_id")
                .and_then(Value::as_str)
        })?
        .trim();
    (!account_id.is_empty()).then(|| Zeroizing::new(account_id.to_owned()))
}

pub fn auth_status() -> Result<(bool, String), CodexError> {
    match read_credentials() {
        Ok(_) => Ok((
            true,
            "ChatGPT subscription credentials are available to PaperFlow Native Host.".to_owned(),
        )),
        Err(CodexError::MissingCredentials | CodexError::InvalidCredentials) => Ok((
            false,
            "Run `codex login` in a terminal, then check again.".to_owned(),
        )),
        Err(error) => Err(error),
    }
}

pub fn login() -> Result<(bool, String), CodexError> {
    let result = run_codex_command(&["login"], CODEX_TIMEOUT)?;
    let authenticated = result.0 && read_credentials().is_ok();
    Ok((authenticated, result.1))
}

fn refresh_credentials() -> Result<(), CodexError> {
    let (success, _) = run_codex_command(&["login", "status"], CREDENTIAL_REFRESH_TIMEOUT)?;
    if success {
        Ok(())
    } else {
        Err(CodexError::AuthenticationExpired)
    }
}

fn run_codex_command(args: &[&str], timeout: Duration) -> Result<(bool, String), CodexError> {
    let codex = find_executable().ok_or(CodexError::NotFound)?;
    let mut child = Command::new(codex)
        .args(args)
        .current_dir(std::env::temp_dir())
        .env("NO_COLOR", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| CodexError::Start)?;
    let stdout = child.stdout.take().ok_or(CodexError::Start)?;
    let stderr = child.stderr.take().ok_or(CodexError::Start)?;
    let stdout_thread = thread::spawn(move || read_limited(stdout, 32_768));
    let stderr_thread = thread::spawn(move || read_limited(stderr, 32_768));
    let deadline = Instant::now() + timeout;
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|_| CodexError::Start)? {
            break status;
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            let _ = stdout_thread.join();
            let _ = stderr_thread.join();
            return Err(CodexError::Timeout);
        }
        thread::sleep(Duration::from_millis(100));
    };
    let stdout = stdout_thread.join().map_err(|_| CodexError::Start)?;
    let stderr = stderr_thread.join().map_err(|_| CodexError::Start)?;
    Ok((status.success(), first_nonempty(&stdout, &stderr)))
}

fn read_limited(reader: impl Read, limit: u64) -> Vec<u8> {
    let mut value = Vec::new();
    let _ = reader.take(limit).read_to_end(&mut value);
    value
}

pub fn chat(
    question: &str,
    context: &str,
    images: &[String],
    model: Option<&str>,
    language: ResponseLanguage,
    emit: &mut impl FnMut(Response),
) -> Result<String, CodexError> {
    validate_images(images)?;
    let client = codex_client()?;
    let mut credentials = read_credentials()?;
    for attempt in 0..2 {
        match chat_once(
            client,
            &credentials,
            question,
            context,
            images,
            model,
            language,
            emit,
        ) {
            Ok(answer) => return Ok(answer),
            Err(RequestError::Unauthorized) if attempt == 0 => {
                refresh_credentials()?;
                credentials = read_credentials()?;
            }
            Err(RequestError::Unauthorized) => {
                return Err(CodexError::AuthenticationExpired);
            }
            Err(RequestError::Public(error)) => return Err(error),
        }
    }
    Err(CodexError::AuthenticationExpired)
}

#[allow(clippy::too_many_arguments)]
fn chat_once(
    client: &Client,
    credentials: &Credentials,
    question: &str,
    context: &str,
    images: &[String],
    requested_model: Option<&str>,
    language: ResponseLanguage,
    emit: &mut impl FnMut(Response),
) -> Result<String, RequestError> {
    let headers = build_headers(credentials)?;
    let model = match requested_model
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(model) => model.to_owned(),
        None => fetch_default_model(client, &headers)?,
    };
    let response = client
        .post(CODEX_RESPONSES_URL)
        .headers(headers)
        .json(&build_payload(question, context, images, &model, language))
        .send()
        .map_err(map_request_error)?;
    check_status(response.status())?;
    emit(Response::event("progress", "connected"));
    parse_response(response, emit).map_err(RequestError::Public)
}

fn build_headers(credentials: &Credentials) -> Result<HeaderMap, CodexError> {
    let mut headers = HeaderMap::new();
    let authorization = Zeroizing::new(format!("Bearer {}", credentials.access_token.as_str()));
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&authorization).map_err(|_| CodexError::InvalidCredentials)?,
    );
    headers.insert(USER_AGENT, HeaderValue::from_static(CODEX_USER_AGENT));
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(ACCEPT, HeaderValue::from_static("text/event-stream"));
    headers.insert("originator", HeaderValue::from_static("codex_cli_rs"));
    headers.insert(
        "chatgpt-account-id",
        HeaderValue::from_str(&credentials.account_id)
            .map_err(|_| CodexError::InvalidCredentials)?,
    );
    Ok(headers)
}

fn fetch_default_model(client: &Client, headers: &HeaderMap) -> Result<String, RequestError> {
    let mut headers = headers.clone();
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    let response = client
        .get(CODEX_MODELS_URL)
        .headers(headers)
        .send()
        .map_err(map_request_error)?;
    check_status(response.status())?;
    let payload: Value = response
        .json()
        .map_err(|_| RequestError::Public(CodexError::NoModel))?;
    first_model_id(&payload).ok_or(RequestError::Public(CodexError::NoModel))
}

fn first_model_id(payload: &Value) -> Option<String> {
    let models = payload
        .as_array()
        .or_else(|| payload.get("models").and_then(Value::as_array))?;
    let default = models.iter().find(|model| {
        model.get("is_default").and_then(Value::as_bool) == Some(true)
            || model.get("default").and_then(Value::as_bool) == Some(true)
    });
    default.into_iter().chain(models.iter()).find_map(model_id)
}

fn model_id(model: &Value) -> Option<String> {
    ["id", "slug", "model_id", "model"]
        .iter()
        .find_map(|key| model.get(key).and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn check_status(status: StatusCode) -> Result<(), RequestError> {
    match status.as_u16() {
        200..=299 => Ok(()),
        401 | 403 => Err(RequestError::Unauthorized),
        429 => Err(RequestError::Public(CodexError::RateLimited)),
        code @ 500..=599 => Err(RequestError::Public(CodexError::ServiceUnavailable(code))),
        code => Err(RequestError::Public(CodexError::Rejected(code))),
    }
}

fn map_request_error(error: reqwest::Error) -> RequestError {
    RequestError::Public(if error.is_timeout() {
        CodexError::Timeout
    } else {
        CodexError::Network
    })
}

fn codex_client() -> Result<&'static Client, CodexError> {
    if let Some(client) = CODEX_CLIENT.get() {
        return Ok(client);
    }
    let mut builder = Client::builder()
        .timeout(CODEX_TIMEOUT)
        .pool_idle_timeout(Duration::from_secs(90))
        .tcp_nodelay(true);
    if !has_proxy_environment() {
        if let Some(proxy_url) = system_proxy_url() {
            let proxy = reqwest::Proxy::all(proxy_url).map_err(|_| CodexError::Network)?;
            builder = builder.proxy(proxy);
        }
    }
    let client = builder.build().map_err(|_| CodexError::Network)?;
    let _ = CODEX_CLIENT.set(client);
    CODEX_CLIENT.get().ok_or(CodexError::Network)
}

fn has_proxy_environment() -> bool {
    [
        "HTTPS_PROXY",
        "https_proxy",
        "HTTP_PROXY",
        "http_proxy",
        "ALL_PROXY",
        "all_proxy",
    ]
    .iter()
    .any(|key| std::env::var_os(key).is_some_and(|value| !value.is_empty()))
}

#[cfg(target_os = "windows")]
fn system_proxy_url() -> Option<String> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};

    let internet_settings = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings")
        .ok()?;
    let enabled: u32 = internet_settings.get_value("ProxyEnable").ok()?;
    if enabled == 0 {
        return None;
    }
    let server: String = internet_settings.get_value("ProxyServer").ok()?;
    parse_windows_proxy_server(&server)
}

#[cfg(target_os = "macos")]
fn system_proxy_url() -> Option<String> {
    let output = Command::new("/usr/sbin/scutil")
        .arg("--proxy")
        .stdin(Stdio::null())
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).into_owned())
        .and_then(|raw| parse_macos_proxy(&raw))
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn system_proxy_url() -> Option<String> {
    None
}

#[cfg(any(target_os = "windows", test))]
fn parse_windows_proxy_server(server: &str) -> Option<String> {
    let trimmed = server.trim();
    if trimmed.is_empty() {
        return None;
    }
    if !trimmed.contains('=') {
        return normalize_proxy_url(trimmed);
    }
    let mut http = None;
    let mut https = None;
    for entry in trimmed.split(';') {
        let Some((protocol, address)) = entry.split_once('=') else {
            continue;
        };
        match protocol.trim().to_ascii_lowercase().as_str() {
            "https" => https = normalize_proxy_url(address),
            "http" => http = normalize_proxy_url(address),
            _ => {}
        }
    }
    https.or(http)
}

#[cfg(any(target_os = "macos", test))]
fn parse_macos_proxy(raw: &str) -> Option<String> {
    let value = |key: &str| {
        raw.lines().find_map(|line| {
            let (candidate, value) = line.split_once(':')?;
            (candidate.trim() == key).then(|| value.trim())
        })
    };
    for prefix in ["HTTPS", "HTTP"] {
        if value(&format!("{prefix}Enable")) != Some("1") {
            continue;
        }
        let host = value(&format!("{prefix}Proxy"))?;
        let port = value(&format!("{prefix}Port"))?;
        if let Some(proxy) = normalize_proxy_url(&format!("{host}:{port}")) {
            return Some(proxy);
        }
    }
    None
}

#[cfg(any(target_os = "windows", target_os = "macos", test))]
fn normalize_proxy_url(address: &str) -> Option<String> {
    let address = address.trim();
    if address.is_empty() || address.chars().any(char::is_whitespace) {
        return None;
    }
    let candidate = if address.contains("://") {
        address.to_owned()
    } else {
        format!("http://{address}")
    };
    let parsed = url::Url::parse(&candidate).ok()?;
    matches!(parsed.scheme(), "http" | "https").then_some(candidate)
}

fn build_payload(
    question: &str,
    context: &str,
    images: &[String],
    model: &str,
    language: ResponseLanguage,
) -> Value {
    let instructions = format!(
        "You are PaperFlow, a precise research-paper reading assistant. Use only the supplied \
paper context and be explicit when it is insufficient. Do not use tools, inspect local files, \
run commands, or change the computer. Answer in {}. Cite factual claims from the supplied \
paper as [Page N], and never invent page numbers. For math, use only $...$ for inline formulas \
and $$...$$ for display formulas; never wrap formulas in plain brackets. Return only the \
answer in Markdown.",
        language.instruction()
    );
    let prompt = format!(
        "PAPER CONTEXT\n{}\n\nUSER QUESTION\n{}",
        if context.is_empty() {
            "[No extracted paper text available]"
        } else {
            context
        },
        question
    );
    let mut content = vec![json!({ "type": "input_text", "text": prompt })];
    content.extend(
        images
            .iter()
            .map(|image| json!({ "type": "input_image", "image_url": image })),
    );
    json!({
        "model": model,
        "instructions": instructions,
        "input": [{
            "type": "message",
            "role": "user",
            "content": content
        }],
        "store": false,
        "stream": true
    })
}

fn validate_images(images: &[String]) -> Result<(), CodexError> {
    for image in images {
        let (header, encoded) = image.split_once(',').ok_or(CodexError::InvalidImage)?;
        if !matches!(
            header,
            "data:image/jpeg;base64" | "data:image/png;base64" | "data:image/webp;base64"
        ) {
            return Err(CodexError::InvalidImage);
        }
        if encoded.len() > MAX_IMAGE_BYTES.saturating_mul(4).div_ceil(3) + 4 {
            return Err(CodexError::InvalidImage);
        }
        let decoded = STANDARD
            .decode(encoded)
            .map_err(|_| CodexError::InvalidImage)?;
        if decoded.len() > MAX_IMAGE_BYTES {
            return Err(CodexError::InvalidImage);
        }
    }
    Ok(())
}

fn parse_response(
    response: HttpResponse,
    emit: &mut impl FnMut(Response),
) -> Result<String, CodexError> {
    let mut reader = BufReader::new(response);
    let mut line = String::new();
    let mut non_sse = String::new();
    let mut state = StreamState::default();
    loop {
        line.clear();
        let bytes = reader.read_line(&mut line).map_err(|error| {
            if error.kind() == std::io::ErrorKind::TimedOut {
                CodexError::Timeout
            } else {
                CodexError::Network
            }
        })?;
        if bytes == 0 {
            break;
        }
        let trimmed = line.trim();
        let Some(data) = trimmed.strip_prefix("data:") else {
            if !trimmed.is_empty() && non_sse.len() < MAX_NON_SSE_BYTES {
                non_sse.push_str(trimmed);
            }
            continue;
        };
        let data = data.trim();
        if data.is_empty() || data == "[DONE]" {
            continue;
        }
        if let Ok(event) = serde_json::from_str::<Value>(data) {
            apply_stream_event(&event, &mut state, emit)?;
        }
    }
    if state.answer.trim().is_empty() && state.fallback.is_none() && !non_sse.is_empty() {
        if let Ok(payload) = serde_json::from_str::<Value>(&non_sse) {
            state.fallback = extract_output_text(&payload);
        }
    }
    if state.answer.trim().is_empty() {
        if let Some(fallback) = state.fallback.filter(|value| !value.trim().is_empty()) {
            let mut event = Response::event("delta", "writing");
            event.delta = Some(fallback.clone());
            emit(event);
            return Ok(fallback.trim().to_owned());
        }
        Err(CodexError::NoAnswer)
    } else {
        Ok(state.answer.trim().to_owned())
    }
}

fn apply_stream_event(
    event: &Value,
    state: &mut StreamState,
    emit: &mut impl FnMut(Response),
) -> Result<(), CodexError> {
    match event.get("type").and_then(Value::as_str) {
        Some("response.output_text.delta") => {
            if let Some(delta) = event
                .get("delta")
                .and_then(Value::as_str)
                .filter(|value| !value.is_empty())
            {
                state.answer.push_str(delta);
                let mut response = Response::event("delta", "writing");
                response.delta = Some(delta.to_owned());
                emit(response);
            }
        }
        Some("response.output_item.done") if state.answer.is_empty() => {
            state.fallback = extract_output_text(&event["item"]);
        }
        Some("response.completed") if state.answer.is_empty() => {
            state.fallback = extract_output_text(&event["response"]);
        }
        Some("response.failed" | "error") => {
            return Err(CodexError::Rejected(
                event
                    .pointer("/response/status_code")
                    .or_else(|| event.get("status_code"))
                    .and_then(Value::as_u64)
                    .and_then(|code| u16::try_from(code).ok())
                    .unwrap_or(400),
            ));
        }
        _ => {}
    }
    Ok(())
}

fn extract_output_text(value: &Value) -> Option<String> {
    if let Some(text) = value.get("output_text").and_then(Value::as_str) {
        let text = text.trim();
        if !text.is_empty() {
            return Some(text.to_owned());
        }
    }
    if value.get("type").and_then(Value::as_str) == Some("output_text") {
        if let Some(text) = value.get("text").and_then(Value::as_str) {
            let text = text.trim();
            if !text.is_empty() {
                return Some(text.to_owned());
            }
        }
    }
    for key in ["output", "content"] {
        let parts = value
            .get(key)
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(extract_output_text)
            .collect::<Vec<_>>();
        if !parts.is_empty() {
            return Some(parts.join("\n"));
        }
    }
    None
}

fn first_nonempty(stdout: &[u8], stderr: &[u8]) -> String {
    let stdout = String::from_utf8_lossy(stdout).trim().to_owned();
    if !stdout.is_empty() {
        stdout
    } else {
        String::from_utf8_lossy(stderr).trim().to_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn jwt_with_claims(claims: Value) -> String {
        let payload = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&claims).unwrap());
        format!("header.{payload}.signature")
    }

    #[test]
    fn jwt_account_id_supports_codex_claim_shape() {
        let token = jwt_with_claims(json!({
            "https://api.openai.com/auth": {
                "chatgpt_account_id": "account-123"
            }
        }));
        assert_eq!(
            account_id_from_access_token(&token)
                .as_ref()
                .map(|value| value.as_str()),
            Some("account-123")
        );
    }

    #[test]
    fn payload_uses_codex_responses_shape_without_tools() {
        let payload = build_payload(
            "Why?",
            "[Page 1] Text",
            &["data:image/png;base64,AAAA".to_owned()],
            "gpt-test",
            ResponseLanguage::English,
        );
        assert_eq!(payload["model"], "gpt-test");
        assert_eq!(payload["store"], false);
        assert_eq!(payload["stream"], true);
        assert_eq!(payload["input"][0]["type"], "message");
        assert_eq!(payload["input"][0]["content"][1]["type"], "input_image");
        assert!(payload.get("tools").is_none());
        assert!(payload["instructions"]
            .as_str()
            .is_some_and(|value| value.contains("Do not use tools")));
    }

    #[test]
    fn image_validator_rejects_paths_and_oversized_data() {
        assert!(validate_images(&["/tmp/private.png".to_owned()]).is_err());
        let large = format!("data:image/png;base64,{}", "A".repeat(MAX_IMAGE_BYTES * 2));
        assert!(validate_images(&[large]).is_err());
    }

    #[test]
    fn model_discovery_prefers_explicit_default_then_first_model() {
        let payload = json!({
            "models": [
                { "slug": "first" },
                { "id": "recommended", "is_default": true }
            ]
        });
        assert_eq!(first_model_id(&payload).as_deref(), Some("recommended"));
        assert_eq!(
            first_model_id(&json!([{ "slug": "first" }])).as_deref(),
            Some("first")
        );
    }

    #[test]
    fn stream_parser_handles_delta_and_completed_fallback() {
        let mut emitted = Vec::new();
        let mut state = StreamState::default();
        apply_stream_event(
            &json!({ "type": "response.output_text.delta", "delta": "Hello" }),
            &mut state,
            &mut |event| emitted.push(event.delta.unwrap_or_default()),
        )
        .unwrap();
        assert_eq!(state.answer, "Hello");
        assert_eq!(emitted, ["Hello"]);

        let mut fallback = StreamState::default();
        apply_stream_event(
            &json!({
                "type": "response.completed",
                "response": {
                    "output": [{
                        "content": [{ "type": "output_text", "text": "Done" }]
                    }]
                }
            }),
            &mut fallback,
            &mut |_| {},
        )
        .unwrap();
        assert_eq!(fallback.fallback.as_deref(), Some("Done"));
    }

    #[test]
    fn proxy_parsers_choose_https_and_require_valid_addresses() {
        assert_eq!(
            parse_windows_proxy_server("http=127.0.0.1:8080;https=127.0.0.1:8443"),
            Some("http://127.0.0.1:8443".to_owned())
        );
        assert_eq!(
            parse_macos_proxy("HTTPSEnable : 1\nHTTPSProxy : 127.0.0.1\nHTTPSPort : 7890\n"),
            Some("http://127.0.0.1:7890".to_owned())
        );
        assert_eq!(parse_windows_proxy_server(""), None);
    }

    #[test]
    fn fixed_candidates_do_not_use_request_input() {
        assert!(fixed_candidates()
            .iter()
            .all(|path| !path.as_os_str().is_empty()));
    }
}
