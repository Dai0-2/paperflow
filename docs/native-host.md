# PaperFlow Native Host

PaperFlow uses the separately installed `com.paperflow.ai` Native Messaging
host only for ChatGPT subscription access. The official Codex CLI owns sign-in
and credential refresh; the Host sends paper-chat requests directly to the
ChatGPT Codex Responses service.

OpenAI-compatible API mode and Google Drive sync work without the host. API
requests run in the extension service worker and the API key remains in
device-local extension storage. Legacy `api.*`, `api_key.*`, and `vault.*`
actions remain in protocol version 1 for older extension builds and migration;
the current extension does not call them.

## Security boundary

The Rust host still accepts these schema-validated version 1 actions for current
and compatibility clients:

```text
status
codex.auth_status
codex.login
codex.models
codex.chat
api_key.set
api_key.delete
api.test
api.chat
vault.store_device_key
vault.load_device_key
vault.delete_device_key
```

Messages are length-prefixed JSON with a 1 MiB limit. Unknown actions, unknown fields, malformed JSON, invalid UUIDs, oversized prompts, and invalid key encodings are rejected. The protocol does not accept shell commands, executable paths, file paths, CLI argument arrays, environment variables, or log payloads.

Codex is discovered using fixed platform locations or the `codex` executable on
the host `PATH`. The login action runs only the fixed official `codex login`
command and waits up to five minutes for browser authorization.

For paper chat, the Host:

1. Reads `auth.json` from `CODEX_HOME`, or from the default `.codex` directory
   in the current user's home folder.
2. Keeps the access token in zeroizing process memory and derives the account
   ID from the signed token only when the file does not provide one.
3. Retrieves the current default model from
   `https://chatgpt.com/backend-api/codex/models` unless the user selected an
   explicit model override.
4. Sends a bounded, tool-free Responses request to
   `https://chatgpt.com/backend-api/codex/responses` and forwards only progress,
   text deltas, and the final answer to the extension.
5. On HTTP 401 or 403, runs the fixed `codex login status` command once, reloads
   the credential file, and retries once.

This direct transport does not start `codex app-server` or `codex exec`, so it
does not load user MCP servers, plugins, tools, shell access, or repository
configuration. Images remain allow-listed data URLs and are never written to
temporary files. Environment proxy variables are honored; the Host also reads
the active Windows user proxy and macOS system HTTPS/HTTP proxy when no proxy
environment variable is set.

The Host never returns the access token to Chrome and does not copy it into a
PaperFlow credential store. It does not log prompts, responses, paper text, API
keys, vault keys, OAuth tokens, or local paths.

## Legacy credential stores

| Platform | Store |
|---|---|
| macOS | Keychain |
| Windows | Credential Manager |
| Linux | Secret Service |

Older builds used service name `com.paperflow.ai`, with API-key account
`openai_api_key`, and may also have vault accounts named
`vault_device_key:<vault UUID>`; current one-click Google sync does not create or
read them. The current extension stores new API keys in Chrome extension-local
storage and does not read these legacy host credentials. Host uninstallers
preserve legacy credentials by default.

If Secret Service is unavailable on Linux, the host reports that persistent credential storage is unavailable. PaperFlow does not fall back to a plaintext file.

## Install a prebuilt package

End users should download only the package for their operating system:

- [Windows](https://github.com/Dai0-2/paperflow/releases/latest/download/paperflow-native-host-windows.zip)
- [macOS](https://github.com/Dai0-2/paperflow/releases/latest/download/paperflow-native-host-macos.zip)
- [Linux](https://github.com/Dai0-2/paperflow/releases/latest/download/paperflow-native-host-linux.zip)

Extract the archive. On Windows, double-click `INSTALL-PAPERFLOW.cmd`. On macOS,
run `bash install-macos.sh`; on Linux, run `sh install-linux.sh`. These packages
include the compiled Host and do not require Rust or platform compiler tools.

## Build from source

```bash
cargo fmt --manifest-path native-host/Cargo.toml -- --check
cargo test --locked --manifest-path native-host/Cargo.toml
cargo clippy --all-targets --locked --manifest-path native-host/Cargo.toml -- -D warnings
cargo build --release --locked --manifest-path native-host/Cargo.toml
```

On Debian or Ubuntu, install `libdbus-1-dev` and `pkg-config` before building.

## Install and uninstall

The checked-in manifest files are templates for inspection. Installers generate a manifest with the actual absolute binary path and register only the fixed production extension ID `dffiahjmpkmellmjijffpcofoahbccoc`.

When run from a source checkout, each installer builds the Native Host
automatically if no packaged binary or previous release build exists. Install
stable Rust and the platform build dependencies above before running it.

### macOS

```bash
bash native-host/install/install-macos.sh
bash native-host/install/uninstall-macos.sh
```

### Linux

```bash
sh native-host/install/install-linux.sh
sh native-host/install/uninstall-linux.sh
```

### Windows PowerShell

API mode does not use this installer. For ChatGPT/Codex subscription mode,
install Visual Studio Build Tools 2022 with the **Desktop development with C++**
workload, then install Rust:

```powershell
winget install --id Rustlang.Rustup -e
```

Close and reopen PowerShell, verify `cargo --version`, then run:

```powershell
.\native-host\install\install-windows.ps1
.\native-host\install\uninstall-windows.ps1
```

The installer builds the Host automatically. A "`cargo` is not recognized"
error means the Rust installation is missing or the terminal has not been
restarted.

Pass a binary path as the first shell argument or `-BinaryPath` in PowerShell when installing an externally built or signed release binary.

## Legacy Python host

`bridge/paperflow_bridge.py` and `bridge/install.sh` remain available for one compatibility release. The extension probes `status`; a response with `protocolVersion: 1` enables the Rust action names, while a response without a protocol version uses the legacy Python action names. New installations should use the Rust host.

Install the official Codex CLI first and run `codex login`. PaperFlow can also
launch the same official browser sign-in through the fixed `codex login`
action. The Host reads the resulting local token only inside its own process;
the extension never receives or stores it.

## Release signing

CI builds unsigned development artifacts for macOS, Windows, and Linux and emits a SHA-256 checksum. Public distribution additionally requires Apple Developer ID signing and notarization, Windows Authenticode signing, and the chosen Linux package-signing policy. Signing credentials must be supplied by the release environment and never committed.
