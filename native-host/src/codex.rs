use std::{
    io::{BufRead, BufReader, Read, Write},
    path::PathBuf,
    process::{Command, Stdio},
    sync::mpsc::{self, Receiver, RecvTimeoutError},
    thread,
    time::{Duration, Instant},
};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::{json, Value};
use tempfile::{Builder, NamedTempFile};
use thiserror::Error;

use crate::protocol::{Response, ResponseLanguage};

const CODEX_TIMEOUT: Duration = Duration::from_secs(300);
const MAX_IMAGE_BYTES: usize = 400_000;

#[derive(Debug, Error)]
pub enum CodexError {
    #[error("Codex CLI was not found. Install and sign in to the official Codex CLI first.")]
    NotFound,
    #[error("Codex CLI could not be started.")]
    Start,
    #[error("Codex CLI timed out.")]
    Timeout,
    #[error("Codex rejected the request: {0}")]
    Rejected(String),
    #[error("An attached image is invalid or too large.")]
    InvalidImage,
    #[error("Codex did not return an answer.")]
    NoAnswer,
}

pub fn find_executable() -> Option<PathBuf> {
    fixed_candidates()
        .into_iter()
        .find(|path| path.is_file())
        .or_else(|| which::which(executable_name()).ok())
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

pub fn auth_status() -> Result<(bool, String), CodexError> {
    let codex = find_executable().ok_or(CodexError::NotFound)?;
    let result = Command::new(codex)
        .args(["login", "status"])
        .current_dir(std::env::temp_dir())
        .env("NO_COLOR", "1")
        .output()
        .map_err(|_| CodexError::Start)?;
    let detail = first_nonempty(&result.stdout, &result.stderr);
    Ok((result.status.success(), detail))
}

pub fn login() -> Result<(bool, String), CodexError> {
    let codex = find_executable().ok_or(CodexError::NotFound)?;
    let mut child = Command::new(codex)
        .arg("login")
        .current_dir(std::env::temp_dir())
        .env("NO_COLOR", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| CodexError::Start)?;
    let stdout = child.stdout.take().ok_or(CodexError::Start)?;
    let stderr = child.stderr.take().ok_or(CodexError::Start)?;
    let stdout_thread = thread::spawn(move || {
        let mut value = Vec::new();
        let _ = BufReader::new(stdout).take(32_768).read_to_end(&mut value);
        value
    });
    let stderr_thread = thread::spawn(move || {
        let mut value = Vec::new();
        let _ = BufReader::new(stderr).take(32_768).read_to_end(&mut value);
        value
    });
    let deadline = Instant::now() + CODEX_TIMEOUT;
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

pub fn chat(
    question: &str,
    context: &str,
    images: &[String],
    model: Option<&str>,
    language: ResponseLanguage,
    emit: &mut impl FnMut(Response),
) -> Result<String, CodexError> {
    let codex = find_executable().ok_or(CodexError::NotFound)?;
    let image_files = decode_images(images)?;
    let mut command = Command::new(codex);
    command.args(["app-server", "--stdio", "-c", "mcp_servers={}"]);
    for feature in [
        "apps",
        "browser_use",
        "hooks",
        "multi_agent",
        "plugins",
        "shell_tool",
        "skill_search",
        "tool_suggest",
    ] {
        command.args(["--disable", feature]);
    }
    command
        .current_dir(std::env::temp_dir())
        .env("NO_COLOR", "1")
        .env("RUST_LOG", "error")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command.spawn().map_err(|_| CodexError::Start)?;
    let mut stdin = child.stdin.take().ok_or(CodexError::Start)?;
    let stdout = child.stdout.take().ok_or(CodexError::Start)?;
    let stderr = child.stderr.take().ok_or(CodexError::Start)?;
    let (line_sender, line_receiver) = mpsc::channel();
    let stdout_thread = thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if line_sender.send(line).is_err() {
                break;
            }
        }
    });
    let stderr_thread = thread::spawn(move || {
        let mut value = String::new();
        let _ = BufReader::new(stderr)
            .take(8_192)
            .read_to_string(&mut value);
        value
    });

    let result = (|| -> Result<String, CodexError> {
        let deadline = Instant::now() + CODEX_TIMEOUT;
        write_json_line(
            &mut stdin,
            &json!({
            "id": 1,
            "method": "initialize",
            "params": {
                "clientInfo": {
                    "name": "paperflow-native-host",
                    "version": env!("CARGO_PKG_VERSION")
                },
                "capabilities": {
                    "experimentalApi": true
                }
            }
            }),
        )?;
        wait_for_response(&line_receiver, &mut child, 1, deadline)?;
        write_json_line(
            &mut stdin,
            &json!({
            "method": "initialized",
            "params": {}
            }),
        )?;
        write_json_line(
            &mut stdin,
            &json!({
            "id": 2,
            "method": "thread/start",
            "params": {
                "cwd": std::env::temp_dir(),
                "model": model,
                "approvalPolicy": "never",
                "sandbox": "read-only",
                "ephemeral": true,
                "dynamicTools": [],
                "environments": [],
                "baseInstructions": "You are PaperFlow, a research-paper reading assistant. Never use tools, inspect local files, run commands, or modify the computer. Return only the requested answer.",
                "config": {
                    "model_reasoning_effort": "low",
                    "mcp_servers": {}
                }
            }
            }),
        )?;
        let thread_response = wait_for_response(&line_receiver, &mut child, 2, deadline)?;
        let thread_id = thread_response
            .pointer("/result/thread/id")
            .and_then(Value::as_str)
            .ok_or(CodexError::Start)?;
        emit(Response::event("progress", "connected"));

        let mut input = vec![json!({
            "type": "text",
            "text": build_prompt(question, context, language)
        })];
        input.extend(image_files.iter().map(|image| {
            json!({
                "type": "localImage",
                "path": image.path()
            })
        }));
        write_json_line(
            &mut stdin,
            &json!({
            "id": 3,
            "method": "turn/start",
            "params": {
                "threadId": thread_id,
                "input": input,
                "effort": "low",
                "environments": [],
                "sandboxPolicy": {
                    "type": "readOnly",
                    "networkAccess": false
                }
            }
            }),
        )?;

        let mut answer = String::new();
        let mut completed_answer: Option<String> = None;
        let mut received_delta = false;
        loop {
            let event = next_event(&line_receiver, &mut child, deadline)?;
            match event.get("method").and_then(Value::as_str) {
                Some("turn/started") => emit(Response::event("progress", "reasoning")),
                Some("item/agentMessage/delta") => {
                    if let Some(delta) = event.pointer("/params/delta").and_then(Value::as_str) {
                        if !delta.is_empty() {
                            received_delta = true;
                            answer.push_str(delta);
                            let mut response = Response::event("delta", "writing");
                            response.delta = Some(delta.to_owned());
                            emit(response);
                        }
                    }
                }
                Some("item/completed") => {
                    let item = &event["params"]["item"];
                    if item.get("type").and_then(Value::as_str) == Some("agentMessage")
                        && item.get("phase").and_then(Value::as_str) != Some("commentary")
                    {
                        completed_answer =
                            item.get("text").and_then(Value::as_str).map(str::to_owned);
                    }
                }
                Some("turn/completed") => {
                    let turn = &event["params"]["turn"];
                    if turn.get("status").and_then(Value::as_str) != Some("completed") {
                        return Err(turn
                            .pointer("/error/message")
                            .and_then(Value::as_str)
                            .map(|message| CodexError::Rejected(message.to_owned()))
                            .unwrap_or(CodexError::NoAnswer));
                    }
                    if let Some(final_answer) =
                        completed_answer.filter(|value| !value.trim().is_empty())
                    {
                        if !received_delta {
                            let mut response = Response::event("delta", "writing");
                            response.delta = Some(final_answer.clone());
                            emit(response);
                        }
                        answer = final_answer;
                    }
                    return if answer.trim().is_empty() {
                        Err(CodexError::NoAnswer)
                    } else {
                        Ok(answer.trim().to_owned())
                    };
                }
                _ => {}
            }
        }
    })();
    stop_child(&mut child, stdout_thread, stderr_thread);
    result
}

fn write_json_line(writer: &mut impl Write, value: &Value) -> Result<(), CodexError> {
    serde_json::to_writer(&mut *writer, value).map_err(|_| CodexError::Start)?;
    writer.write_all(b"\n").map_err(|_| CodexError::Start)?;
    writer.flush().map_err(|_| CodexError::Start)
}

fn wait_for_response(
    receiver: &Receiver<String>,
    child: &mut std::process::Child,
    id: u64,
    deadline: Instant,
) -> Result<Value, CodexError> {
    loop {
        let event = next_event(receiver, child, deadline)?;
        if event.get("id").and_then(Value::as_u64) == Some(id) {
            return if event.get("result").is_some() {
                Ok(event)
            } else {
                Err(event
                    .pointer("/error/message")
                    .and_then(Value::as_str)
                    .map(|message| CodexError::Rejected(message.to_owned()))
                    .unwrap_or(CodexError::Start))
            };
        }
    }
}

fn next_event(
    receiver: &Receiver<String>,
    child: &mut std::process::Child,
    deadline: Instant,
) -> Result<Value, CodexError> {
    loop {
        if Instant::now() >= deadline {
            return Err(CodexError::Timeout);
        }
        match receiver.recv_timeout(Duration::from_millis(100)) {
            Ok(line) => {
                if let Ok(event) = serde_json::from_str::<Value>(&line) {
                    return Ok(event);
                }
            }
            Err(RecvTimeoutError::Timeout) => {
                if child.try_wait().map_err(|_| CodexError::Start)?.is_some() {
                    return Err(CodexError::NoAnswer);
                }
            }
            Err(RecvTimeoutError::Disconnected) => return Err(CodexError::NoAnswer),
        }
    }
}

fn stop_child(
    child: &mut std::process::Child,
    stdout_thread: thread::JoinHandle<()>,
    stderr_thread: thread::JoinHandle<String>,
) {
    let _ = child.kill();
    let _ = child.wait();
    let _ = stdout_thread.join();
    let _ = stderr_thread.join();
}

fn build_prompt(question: &str, context: &str, language: ResponseLanguage) -> String {
    format!(
        "You are PaperFlow, a precise research-paper reading assistant. \
Answer the user's question using only the supplied paper context. Be explicit when the \
context is insufficient. Do not inspect local files, run commands, or change the computer. \
Answer in {}. Cite factual claims from the supplied paper as [Page N], and never invent \
page numbers. Return only the answer in Markdown.\n\nPAPER CONTEXT\n{}\n\nUSER QUESTION\n{}",
        language.instruction(),
        if context.is_empty() {
            "[No extracted paper text available]"
        } else {
            context
        },
        question
    )
}

fn decode_images(images: &[String]) -> Result<Vec<NamedTempFile>, CodexError> {
    images
        .iter()
        .enumerate()
        .map(|(index, data_url)| {
            let (header, encoded) = data_url.split_once(',').ok_or(CodexError::InvalidImage)?;
            let extension = match header {
                "data:image/jpeg;base64" => ".jpg",
                "data:image/png;base64" => ".png",
                "data:image/webp;base64" => ".webp",
                _ => return Err(CodexError::InvalidImage),
            };
            let raw = STANDARD
                .decode(encoded)
                .map_err(|_| CodexError::InvalidImage)?;
            if raw.len() > MAX_IMAGE_BYTES {
                return Err(CodexError::InvalidImage);
            }
            let mut file = Builder::new()
                .prefix(&format!("paperflow-image-{index}-"))
                .suffix(extension)
                .tempfile()
                .map_err(|_| CodexError::Start)?;
            file.write_all(&raw).map_err(|_| CodexError::Start)?;
            Ok(file)
        })
        .collect()
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

    #[test]
    fn prompt_forbids_local_side_effects() {
        let prompt = build_prompt("Why?", "[Page 1] Text", ResponseLanguage::English);
        assert!(prompt.contains("Do not inspect local files, run commands"));
        assert!(prompt.contains("[Page 1] Text"));
    }

    #[test]
    fn image_decoder_rejects_paths_and_oversized_data() {
        assert!(decode_images(&["/tmp/private.png".to_owned()]).is_err());
        let large = format!("data:image/png;base64,{}", "A".repeat(MAX_IMAGE_BYTES * 2));
        assert!(decode_images(&[large]).is_err());
    }

    #[test]
    fn fixed_candidates_do_not_use_request_input() {
        assert!(fixed_candidates()
            .iter()
            .all(|path| !path.as_os_str().is_empty()));
    }
}
