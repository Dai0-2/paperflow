# Security Policy

## Sensitive data

Do not commit or share:

- OpenAI, Anthropic, or compatible-provider API keys
- OAuth access or refresh tokens
- `~/.codex/auth.json`
- Chrome profile data or ChatGPT cookies
- private paper content or exported PaperFlow databases

PaperFlow does not use private ChatGPT web endpoints or simulate `chatgpt.com` sessions. ChatGPT subscription access uses the official Codex CLI through a local Native Messaging host; credentials remain outside the extension. API keys are stored in macOS Keychain, Windows Credential Manager, or Linux Secret Service and are never returned to extension storage.

## PDF and extension permissions

- Remote PDF access is limited to declared arXiv/OpenReview hosts or an origin the user explicitly grants through Chrome optional permissions.
- Local PDFs are opened only after a file-picker action.
- PDF pages and extracted text stay local unless the user sends bounded context to the selected AI provider.
- The default direct-PDF redirect is opt-in and can be disabled in Settings.
- PaperFlow does not inspect or modify another PDF extension's internal DOM.

## Local persistence

Paper metadata, conversations, memory, selections, annotations, and reading
state are stored in the browser's local IndexedDB database. Offline documents
use OPFS. Lightweight display and provider preferences use `localStorage`.
Saved-library data is synchronized only after the user explicitly connects a
Google account; temporary workspaces stay local. There is no telemetry.

The v0.7-to-v1 database migration saves an unmodified copy of every legacy
IndexedDB store in the atomic upgrade transaction. If the database cannot be
opened, application surfaces redirect to a read-only recovery exporter instead
of continuing to write. Recovery exports exclude OPFS files and credentials.

## Local OCR and MV3 code integrity

OCR runs only after an explicit user action. The Tesseract worker, WebAssembly
core, and English/Simplified Chinese data are bundled in the extension. Locked
dependency patches remove upstream CDN defaults and dynamic `Function`
compatibility probes; missing local paths fail closed.

Every packaged extension is scanned for source maps, runtime CDN references,
`eval`/`Function` construction, credential patterns, logs, test data, and local
absolute paths. Chrome optional host permissions are used only for user-opened
PDFs and explicit metadata/API requests, not for loading executable code.

## Encrypted Google Drive sync

- Google authorization uses Chrome Identity and only the `drive.file` scope. OAuth tokens remain under Chrome's control and are never written to IndexedDB, OPFS, `localStorage`, Drive, logs, or exports.
- Development builds without `PAPERFLOW_GOOGLE_OAUTH_CLIENT_ID` remain loadable but show sync as unconfigured. Release builds fail when the client ID is missing.
- PaperFlow creates a visible `PaperFlow` folder. Its readable sync header contains the protocol version, sync UUID, key-management mode, and account-managed encryption key material.
- Business objects use independent random keys and chunked AES-256-GCM. AAD binds the sync UUID, protocol version, object type, logical ID, and chunk index.
- Drive object names are HMAC-derived opaque IDs. Titles, authors, DOI values, notes, conversations, PDF bytes, and logical IDs are not used as Drive file names or metadata.
- Operation batches and snapshots are immutable encrypted objects. Their Drive metadata contains only protocol classification and random identifiers, never paper IDs, titles, DOI values, note text, or attachment names.
- PDF backup is off by default. When enabled, uploads use resumable sessions. IndexedDB checkpoints may contain the resumable session URL, byte offset, and encrypted chunk hash, but never OAuth tokens or plaintext PDF data.
- Replayed operation IDs are idempotent. Concurrent note edits preserve a conflict copy instead of silently overwriting user text.
- Account-managed encryption prevents ordinary Drive browsing from exposing content, but it is not a zero-knowledge boundary: access to the Google account and all PaperFlow-created files is sufficient to restore synchronized data.
- Legacy password and recovery-key headers are accepted only for one-time migration. After a successful unlock, PaperFlow replaces the legacy header while preserving the sync UUID and historical encrypted objects.

## Native bridge

The Rust host accepts only fixed actions validated independently by Zod and
Serde and constructs fixed Codex/API requests. It does not accept shell
strings, arbitrary commands, executable paths, file paths, argument arrays, or
environment variables from the extension. Native messages are limited to
1 MiB. Unknown actions, extra fields, malformed frames, and invalid values fail
closed. Logs must exclude API keys, sync keys, legacy recovery keys,
authentication tokens, private document text, and unredacted local paths.

Linux API-key persistence is disabled when Secret Service is unavailable;
PaperFlow never falls back to a plaintext credential file.

## Reporting a vulnerability

Please do not open a public issue for a credential leak or exploitable vulnerability. Use GitHub's private vulnerability reporting feature once the public repository is enabled.

Include affected versions, reproduction steps, expected impact, and any suggested mitigation. Do not include live credentials or private documents.
