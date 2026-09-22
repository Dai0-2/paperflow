# Security Policy

## Sensitive data

Do not commit or share:

- OpenAI, Anthropic, or compatible-provider API keys
- OAuth access or refresh tokens
- `~/.codex/auth.json`
- Chrome profile data or ChatGPT cookies
- private paper content or exported PaperFlow databases

PaperFlow does not use private ChatGPT web endpoints or simulate `chatgpt.com` sessions. ChatGPT subscription access uses the official Codex CLI through a local Native Messaging bridge; credentials remain outside the extension. API keys are stored in macOS Keychain and are never returned to extension storage.

## PDF and extension permissions

- Remote PDF access is limited to declared arXiv/OpenReview hosts or an origin the user explicitly grants through Chrome optional permissions.
- Local PDFs are opened only after a file-picker action.
- PDF pages and extracted text stay local unless the user sends bounded context to the selected AI provider.
- The default direct-PDF redirect is opt-in and can be disabled in Settings.
- PaperFlow does not inspect or modify another PDF extension's internal DOM.

## Local persistence

Paper metadata, conversations, memory, selections, annotations, and reading state are stored in the browser's local IndexedDB database. Lightweight display and provider preferences use `localStorage`. Saved-library data is synchronized only after the user explicitly connects and creates or unlocks a vault; temporary workspaces stay local. There is no telemetry.

## Encrypted Google Drive vault

- Google authorization uses Chrome Identity and only the `drive.file` scope. OAuth tokens remain under Chrome's control and are never written to IndexedDB, OPFS, `localStorage`, Drive, logs, or exports.
- Development builds without `PAPERFLOW_GOOGLE_OAUTH_CLIENT_ID` remain loadable but show sync as unconfigured. Release builds fail when the client ID is missing.
- PaperFlow creates a visible `PaperFlow` folder. `vault.json` contains only the protocol version, vault ID, KDF parameters, and password/recovery wrappers for the Vault Master Key.
- Business objects use independent random keys and chunked AES-256-GCM. AAD binds the vault, protocol version, object type, logical ID, and chunk index.
- Drive object names are HMAC-derived opaque IDs. Titles, authors, DOI values, notes, conversations, PDF bytes, and logical IDs are not used as Drive file names or metadata.
- The vault password uses PBKDF2-HMAC-SHA-256 with a random 128-bit salt and 600,000 iterations. The 256-bit recovery key uses HKDF-SHA-256. There is no recovery bypass.
- The decrypted Vault Master Key is session memory only by default. The explicit **Remember this device** option stores it through the Native Host in the operating-system credential store, never browser storage.
- Operation batches and snapshots are immutable encrypted objects. Their Drive metadata contains only protocol classification and random identifiers, never paper IDs, titles, DOI values, note text, or attachment names.
- PDF uploads use resumable sessions. IndexedDB checkpoints may contain the resumable session URL, byte offset, and encrypted chunk hash, but never OAuth tokens, plaintext PDF data, or the Vault Master Key.
- Replayed operation IDs are idempotent. Concurrent note edits preserve a conflict copy instead of silently overwriting user text.

## Native bridge

The bridge accepts only fixed, schema-validated actions and constructs fixed Codex/API requests. Vault credential actions accept only a UUID vault ID and an exact 256-bit Base64 key. It must not accept shell strings or arbitrary commands. Logs must exclude API keys, vault keys, recovery keys, authentication tokens, private document text, and unredacted local paths.

## Reporting a vulnerability

Please do not open a public issue for a credential leak or exploitable vulnerability. Use GitHub's private vulnerability reporting feature once the public repository is enabled.

Include affected versions, reproduction steps, expected impact, and any suggested mitigation. Do not include live credentials or private documents.
