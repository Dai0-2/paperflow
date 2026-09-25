# PaperFlow Native Host

PaperFlow uses the separately installed `com.paperflow.ai` Native Messaging
host only for ChatGPT subscription access through an installed and authenticated
official Codex CLI.

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

Codex is discovered using fixed platform locations or the `codex` executable on the host `PATH`. The login action runs only the fixed official `codex login` command and waits up to five minutes for browser authorization. Paper chat always runs with a fixed argument list, an ephemeral session, a read-only sandbox, and a temporary working directory. Temporary image files are decoded only from allow-listed image data URLs and are removed automatically.

The host does not log prompts, responses, paper text, API keys, vault keys, OAuth tokens, or local paths.

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

## Build

```bash
cargo fmt --manifest-path native-host/Cargo.toml -- --check
cargo test --locked --manifest-path native-host/Cargo.toml
cargo clippy --all-targets --locked --manifest-path native-host/Cargo.toml -- -D warnings
cargo build --release --locked --manifest-path native-host/Cargo.toml
```

On Debian or Ubuntu, install `libdbus-1-dev` and `pkg-config` before building.

## Install and uninstall

The checked-in manifest files are templates for inspection. Installers generate a manifest with the actual absolute binary path and register only the fixed production extension ID `dffiahjmpkmellmjijffpcofoahbccoc`.

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

```powershell
.\native-host\install\install-windows.ps1
.\native-host\install\uninstall-windows.ps1
```

Pass a binary path as the first shell argument or `-BinaryPath` in PowerShell when installing an externally built or signed release binary.

## Legacy Python host

`bridge/paperflow_bridge.py` and `bridge/install.sh` remain available for one compatibility release. The extension probes `status`; a response with `protocolVersion: 1` enables the Rust action names, while a response without a protocol version uses the legacy Python action names. New installations should use the Rust host.

Install the official Codex CLI first. PaperFlow can then launch its official browser sign-in through the fixed `codex login` action; it never receives or stores the resulting token.

## Release signing

CI builds unsigned development artifacts for macOS, Windows, and Linux and emits a SHA-256 checksum. Public distribution additionally requires Apple Developer ID signing and notarization, Windows Authenticode signing, and the chosen Linux package-signing policy. Signing credentials must be supplied by the release environment and never committed.
