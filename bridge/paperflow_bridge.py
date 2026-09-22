#!/usr/bin/python3
"""Minimal, allow-listed Chrome Native Messaging bridge for PaperFlow AI."""

import json
import base64
import os
import pathlib
import struct
import subprocess
import sys
import tempfile
import traceback
import urllib.error
import urllib.parse
import urllib.request
import uuid

CODEX_CANDIDATES = (
    "/Applications/ChatGPT.app/Contents/Resources/codex",
    os.path.expanduser("~/.codex/plugins/.plugin-appserver/codex"),
    "/usr/local/bin/codex",
    "/opt/homebrew/bin/codex",
)
KEYCHAIN_SERVICE = "PaperFlow AI"
KEYCHAIN_ACCOUNT = "openai_api_key"
VAULT_ACCOUNT_PREFIX = "vault_device_key:"
LOG_PATH = pathlib.Path.home() / "Library" / "Logs" / "PaperFlow AI" / "bridge.log"


def log_event(message):
    """Log only lifecycle/errors. Never log prompts, responses, or credentials."""
    try:
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with LOG_PATH.open("a", encoding="utf-8") as handle:
            handle.write(message.replace("\n", " ")[:2000] + "\n")
    except OSError:
        pass


def find_codex():
    configured = os.environ.get("PAPERFLOW_CODEX_BIN")
    candidates = ((configured,) if configured else ()) + CODEX_CANDIDATES
    return next((path for path in candidates if path and os.path.isfile(path) and os.access(path, os.X_OK)), None)


def send(payload):
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(raw)))
    sys.stdout.buffer.write(raw)
    sys.stdout.buffer.flush()


def run_command(args, prompt=None, timeout=300):
    return subprocess.run(
        args,
        input=prompt,
        text=True,
        capture_output=True,
        timeout=timeout,
        cwd=tempfile.gettempdir(),
        env={**os.environ, "NO_COLOR": "1"},
        check=False,
    )


def keychain_read():
    result = run_command([
        "/usr/bin/security", "find-generic-password", "-a", KEYCHAIN_ACCOUNT,
        "-s", KEYCHAIN_SERVICE, "-w",
    ], timeout=15)
    return result.stdout.strip() if result.returncode == 0 else ""


def keychain_save(api_key):
    if len(api_key) < 8 or any(character.isspace() for character in api_key):
        return {"ok": False, "error": "That does not look like a valid API key."}
    result = run_command([
        "/usr/bin/security", "add-generic-password", "-U", "-a", KEYCHAIN_ACCOUNT,
        "-s", KEYCHAIN_SERVICE, "-w", api_key,
    ], timeout=20)
    if result.returncode != 0:
        return {"ok": False, "error": (result.stderr or "Could not save the API key to macOS Keychain.").strip()}
    return {"ok": True, "authenticated": True, "detail": "API key saved securely in macOS Keychain."}


def keychain_delete():
    result = run_command([
        "/usr/bin/security", "delete-generic-password", "-a", KEYCHAIN_ACCOUNT,
        "-s", KEYCHAIN_SERVICE,
    ], timeout=15)
    if result.returncode not in (0, 44):
        return {"ok": False, "error": (result.stderr or "Could not remove the API key.").strip()}
    return {"ok": True, "authenticated": False, "detail": "API key removed."}


def vault_account(vault_id):
    try:
        return VAULT_ACCOUNT_PREFIX + str(uuid.UUID(str(vault_id)))
    except ValueError as error:
        raise ValueError("Invalid vault ID.") from error


def vault_store_device_key(vault_id, encoded_key):
    try:
        key = base64.b64decode(str(encoded_key), validate=True)
    except (ValueError, TypeError) as error:
        raise ValueError("Invalid vault key encoding.") from error
    if len(key) != 32:
        raise ValueError("Invalid vault key length.")
    result = run_command([
        "/usr/bin/security", "add-generic-password", "-U",
        "-a", vault_account(vault_id), "-s", KEYCHAIN_SERVICE,
        "-w", str(encoded_key),
    ], timeout=20)
    if result.returncode != 0:
        return {"ok": False, "error": (result.stderr or "Could not remember this device.").strip()}
    return {"ok": True, "detail": "Vault key saved in macOS Keychain."}


def vault_load_device_key(vault_id):
    result = run_command([
        "/usr/bin/security", "find-generic-password",
        "-a", vault_account(vault_id), "-s", KEYCHAIN_SERVICE, "-w",
    ], timeout=15)
    if result.returncode != 0:
        return {"ok": True, "authenticated": False, "detail": "No saved vault key for this device."}
    encoded_key = result.stdout.strip()
    try:
        key = base64.b64decode(encoded_key, validate=True)
    except ValueError:
        return {"ok": False, "error": "The saved vault key is invalid."}
    if len(key) != 32:
        return {"ok": False, "error": "The saved vault key has an invalid length."}
    return {"ok": True, "authenticated": True, "vaultKey": encoded_key}


def vault_delete_device_key(vault_id):
    result = run_command([
        "/usr/bin/security", "delete-generic-password",
        "-a", vault_account(vault_id), "-s", KEYCHAIN_SERVICE,
    ], timeout=15)
    if result.returncode not in (0, 44):
        return {"ok": False, "error": (result.stderr or "Could not forget this device.").strip()}
    return {"ok": True, "authenticated": False, "detail": "Saved vault key removed."}


def api_status():
    configured = bool(keychain_read())
    return {
        "ok": True,
        "authenticated": configured,
        "detail": "API key is stored in macOS Keychain." if configured else "No API key saved.",
    }


def extract_output_text(payload):
    direct = payload.get("output_text")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()
    chunks = []
    for item in payload.get("output", []):
        if not isinstance(item, dict):
            continue
        for content in item.get("content", []):
            if isinstance(content, dict) and content.get("type") == "output_text":
                text = content.get("text")
                if isinstance(text, str):
                    chunks.append(text)
    return "\n".join(chunks).strip()


def normalize_api_endpoint(base_url, protocol):
    value = str(base_url or "https://api.openai.com/v1").strip().rstrip("/")
    parsed = urllib.parse.urlparse(value)
    local_host = parsed.hostname in ("localhost", "127.0.0.1", "::1")
    if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.username or parsed.password or (parsed.scheme != "https" and not local_host):
        raise ValueError("Base URL must use HTTPS (HTTP is allowed only for localhost) and cannot contain credentials.")
    if protocol == "chat-completions":
        if value.endswith("/chat/completions"):
            return value
        if value.endswith("/responses"):
            return value[:-len("/responses")] + "/chat/completions"
        return value + "/chat/completions"
    if value.endswith("/responses"):
        return value
    if value.endswith("/chat/completions"):
        return value[:-len("/chat/completions")] + "/responses"
    return value + "/responses"


def api_chat(request, emit=None):
    api_key = keychain_read()
    if not api_key:
        return {"ok": False, "error": "No OpenAI API key is configured."}
    question = str(request.get("question", "")).strip()
    context = str(request.get("context", "")).strip()
    model = str(request.get("model", "gpt-5.6-luna")).strip() or "gpt-5.6-luna"
    protocol = str(request.get("protocol", "responses"))
    response_language = "Chinese" if request.get("responseLanguage") == "zh" else "English"
    endpoint = normalize_api_endpoint(request.get("baseUrl"), protocol)
    if not question:
        return {"ok": False, "error": "Question is empty."}
    if len(question) > 20000 or len(context) > 180000:
        return {"ok": False, "error": "The paper context is too large."}
    if emit:
        emit({"ok": True, "event": "progress", "stage": "accepted"})

    content = [{
        "type": "input_text",
        "text": f"PAPER CONTEXT\n{context or '[No extracted paper text available]'}\n\nUSER QUESTION\n{question}",
    }]
    for data_url in request.get("images", [])[:2]:
        if isinstance(data_url, str) and data_url.startswith("data:image/"):
            content.append({"type": "input_image", "image_url": data_url})
    instructions = (
        "You are PaperFlow, a precise research-paper reading assistant. "
        f"Use the supplied context, say when it is insufficient, answer in {response_language}, and use Markdown. "
        "Cite factual claims from the supplied paper as [Page N]. Never invent page numbers."
    )
    if protocol == "chat-completions":
        chat_content = [{"type": "text", "text": content[0]["text"]}]
        for item in content[1:]:
            chat_content.append({"type": "image_url", "image_url": {"url": item["image_url"]}})
        payload = {"model": model, "messages": [{"role": "system", "content": instructions}, {"role": "user", "content": chat_content}], "stream": True}
    else:
        payload = {"model": model, "instructions": instructions, "input": [{"role": "user", "content": content}], "store": False, "stream": True}
    body = json.dumps(payload).encode("utf-8")
    upstream = urllib.request.Request(
        endpoint,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "PaperFlow-AI/0.7.0",
        },
    )
    try:
        with urllib.request.urlopen(upstream, timeout=300) as response:
            if emit:
                emit({"ok": True, "event": "progress", "stage": "connected"})
            answer = ""
            fallback = []
            for raw_line in response:
                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line:
                    continue
                if not line.startswith("data:"):
                    fallback.append(line)
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    continue
                try:
                    event = json.loads(data)
                except ValueError:
                    continue
                if protocol == "chat-completions":
                    try:
                        delta = event["choices"][0]["delta"].get("content", "")
                    except (KeyError, IndexError, TypeError, AttributeError):
                        delta = ""
                else:
                    delta = event.get("delta", "") if event.get("type") == "response.output_text.delta" else ""
                if isinstance(delta, str) and delta:
                    answer += delta
                    if emit:
                        emit({"ok": True, "event": "delta", "stage": "writing", "delta": delta})
            if answer.strip():
                return {"ok": True, "answer": answer.strip()}
            payload = json.loads("\n".join(fallback)) if fallback else {}
    except urllib.error.HTTPError as error:
        try:
            details = json.loads(error.read().decode("utf-8")).get("error", {}).get("message", "")
        except (ValueError, AttributeError):
            details = ""
        return {"ok": False, "error": details or f"OpenAI API returned HTTP {error.code}."}
    except urllib.error.URLError as error:
        return {"ok": False, "error": f"Could not reach the OpenAI API: {error.reason}"}
    if protocol == "chat-completions":
        try:
            answer = payload["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError, TypeError, AttributeError):
            answer = ""
    else:
        answer = extract_output_text(payload)
    return {"ok": True, "answer": answer} if answer else {"ok": False, "error": "The OpenAI API returned no text."}


def auth_status(codex):
    result = run_command([codex, "login", "status"], timeout=20)
    detail = (result.stdout or result.stderr).strip()
    return {"ok": result.returncode == 0, "authenticated": result.returncode == 0, "detail": detail}


def login(codex):
    result = run_command([codex, "login"], timeout=300)
    detail = (result.stdout or result.stderr).strip()
    return {"ok": result.returncode == 0, "authenticated": result.returncode == 0, "detail": detail}


def chat(codex, request, emit=None):
    question = str(request.get("question", "")).strip()
    context = str(request.get("context", "")).strip()
    if not question:
        return {"ok": False, "error": "Question is empty."}
    if len(question) > 20000 or len(context) > 180000:
        return {"ok": False, "error": "The paper context is too large."}
    if emit:
        emit({"ok": True, "event": "progress", "stage": "accepted"})

    response_language = "Chinese" if request.get("responseLanguage") == "zh" else "English"
    prompt = (
        "You are PaperFlow, a precise research-paper reading assistant. "
        "Answer the user's question using the supplied paper context. "
        "Be explicit when the context is insufficient. Do not inspect local files, "
        f"run commands, or change the computer. Answer in {response_language}. "
        "Cite factual claims from the supplied paper as [Page N], and never invent page numbers. "
        "Return only the answer in Markdown.\n\n"
        f"PAPER CONTEXT\n{context or '[No extracted paper text available]'}\n\n"
        f"USER QUESTION\n{question}"
    )
    image_paths = []
    for index, data_url in enumerate(request.get("images", [])[:2]):
        if not isinstance(data_url, str) or "," not in data_url:
            continue
        header, encoded = data_url.split(",", 1)
        if not header.startswith("data:image/") or ";base64" not in header:
            continue
        raw = base64.b64decode(encoded, validate=True)
        if len(raw) > 400000:
            raise ValueError("An attached image is too large.")
        image = tempfile.NamedTemporaryFile(prefix=f"paperflow-image-{index}-", suffix=".jpg", delete=False)
        image.write(raw)
        image.close()
        image_paths.append(image.name)

    with tempfile.NamedTemporaryFile(prefix="paperflow-", suffix=".md", delete=False) as output:
        output_path = output.name
    try:
        args = [codex, "exec"]
        for image_path in image_paths:
            args.extend(["--image", image_path])
        args.extend([
            "-", "--skip-git-repo-check", "--ephemeral",
            "--ignore-rules", "--ignore-user-config", "--sandbox", "read-only",
            "--config", 'model_reasoning_effort="low"',
            "--json", "--output-last-message", output_path,
        ])
        answer = ""
        with tempfile.TemporaryFile(mode="w+", encoding="utf-8") as error_output:
            process = subprocess.Popen(
                args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=error_output,
                text=True, bufsize=1, cwd=tempfile.gettempdir(), env={**os.environ, "NO_COLOR": "1"},
            )
            process.stdin.write(prompt)
            process.stdin.close()
            for line in process.stdout:
                try:
                    event = json.loads(line)
                except ValueError:
                    continue
                event_type = event.get("type")
                if emit and event_type == "thread.started":
                    emit({"ok": True, "event": "progress", "stage": "connected"})
                elif emit and event_type == "turn.started":
                    emit({"ok": True, "event": "progress", "stage": "reasoning"})
                elif event_type == "item.completed":
                    item = event.get("item", {})
                    if item.get("type") == "agent_message" and isinstance(item.get("text"), str):
                        answer = item["text"].strip()
                        if answer and emit:
                            emit({"ok": True, "event": "delta", "stage": "writing", "delta": answer})
                    elif emit:
                        emit({"ok": True, "event": "progress", "stage": "reasoning"})
            return_code = process.wait(timeout=300)
            error_output.seek(0)
            error_detail = error_output.read().strip()
        if os.path.exists(output_path):
            with open(output_path, "r", encoding="utf-8") as handle:
                answer = answer or handle.read().strip()
        if return_code != 0 or not answer:
            return {"ok": False, "error": error_detail or "Codex did not return an answer."}
        return {"ok": True, "answer": answer}
    finally:
        try:
            os.unlink(output_path)
        except OSError:
            pass
        for image_path in image_paths:
            try:
                os.unlink(image_path)
            except OSError:
                pass


def handle(request, emit=None):
    action = request.get("action")
    if action == "api.status":
        return api_status()
    if action == "api.save_key":
        return keychain_save(str(request.get("apiKey", "")).strip())
    if action == "api.delete_key":
        return keychain_delete()
    if action == "api.chat":
        return api_chat(request, emit)
    if action == "vault.status":
        return {"ok": True, "authenticated": True, "detail": "macOS Keychain is available."}
    if action == "vault.store_device_key":
        return vault_store_device_key(request.get("vaultId"), request.get("vaultKey"))
    if action == "vault.load_device_key":
        return vault_load_device_key(request.get("vaultId"))
    if action == "vault.delete_device_key":
        return vault_delete_device_key(request.get("vaultId"))
    codex = find_codex()
    if not codex:
        return {"ok": False, "authenticated": False, "error": "Codex CLI was not found."}
    if action == "status":
        return auth_status(codex)
    if action == "login":
        return login(codex)
    if action == "chat":
        return chat(codex, request, emit)
    return {"ok": False, "error": "Unsupported bridge action."}


def main():
    log_event(f"start pid={os.getpid()} executable={sys.executable}")
    header = sys.stdin.buffer.read(4)
    if len(header) != 4:
        return
    size = struct.unpack("<I", header)[0]
    if size > 1024 * 1024:
        send({"ok": False, "error": "Request is too large."})
        return
    payload = sys.stdin.buffer.read(size)
    try:
        request = json.loads(payload.decode("utf-8"))
        result = handle(request, send)
        if request.get("action") in ("chat", "api.chat"):
            result["event"] = "complete"
        send(result)
    except Exception as error:
        log_event(f"error {type(error).__name__}: {error} {traceback.format_exc(limit=2)}")
        send({"ok": False, "error": str(error)})


if __name__ == "__main__":
    main()
