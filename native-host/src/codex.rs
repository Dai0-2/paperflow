use std::{
    fs,
    io::{BufRead, BufReader, Read, Write},
    path::PathBuf,
    process::{Command, Stdio},
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::Value;
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

pub fn chat(
    question: &str,
    context: &str,
    images: &[String],
    language: ResponseLanguage,
    emit: &mut impl FnMut(Response),
) -> Result<String, CodexError> {
    let codex = find_executable().ok_or(CodexError::NotFound)?;
    let image_files = decode_images(images)?;
    let output_file = NamedTempFile::new().map_err(|_| CodexError::Start)?;
    let output_path = output_file.path().to_path_buf();
    let mut command = Command::new(codex);
    command.arg("exec");
    for image in &image_files {
        command.arg("--image").arg(image.path());
    }
    command.args([
        "-",
        "--skip-git-repo-check",
        "--ephemeral",
        "--ignore-rules",
        "--ignore-user-config",
        "--sandbox",
        "read-only",
        "--config",
        "model_reasoning_effort=\"low\"",
        "--json",
        "--output-last-message",
    ]);
    command.arg(&output_path);
    command
        .current_dir(std::env::temp_dir())
        .env("NO_COLOR", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command.spawn().map_err(|_| CodexError::Start)?;
    let prompt = build_prompt(question, context, language);
    let mut stdin = child.stdin.take().ok_or(CodexError::Start)?;
    stdin
        .write_all(prompt.as_bytes())
        .map_err(|_| CodexError::Start)?;
    drop(stdin);

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

    let start = Instant::now();
    let mut answer = String::new();
    loop {
        while let Ok(line) = line_receiver.try_recv() {
            handle_event(&line, &mut answer, emit);
        }
        if let Some(status) = child.try_wait().map_err(|_| CodexError::Start)? {
            let _ = stdout_thread.join();
            while let Ok(line) = line_receiver.try_recv() {
                handle_event(&line, &mut answer, emit);
            }
            let _stderr = stderr_thread.join().unwrap_or_default();
            if answer.trim().is_empty() {
                answer = fs::read_to_string(&output_path).unwrap_or_default();
            }
            if !status.success() || answer.trim().is_empty() {
                return Err(CodexError::NoAnswer);
            }
            return Ok(answer.trim().to_owned());
        }
        if start.elapsed() >= CODEX_TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            let _ = stdout_thread.join();
            let _ = stderr_thread.join();
            return Err(CodexError::Timeout);
        }
        thread::sleep(Duration::from_millis(40));
    }
}

fn handle_event(line: &str, answer: &mut String, emit: &mut impl FnMut(Response)) {
    let Ok(event) = serde_json::from_str::<Value>(line) else {
        return;
    };
    match event.get("type").and_then(Value::as_str) {
        Some("thread.started") => emit(Response::event("progress", "connected")),
        Some("turn.started") => emit(Response::event("progress", "reasoning")),
        Some("item.completed") => {
            let item = &event["item"];
            if item.get("type").and_then(Value::as_str) == Some("agent_message") {
                if let Some(text) = item.get("text").and_then(Value::as_str) {
                    *answer = text.trim().to_owned();
                    let mut response = Response::event("delta", "writing");
                    response.delta = Some(answer.clone());
                    emit(response);
                }
            } else {
                emit(Response::event("progress", "reasoning"));
            }
        }
        _ => {}
    }
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
