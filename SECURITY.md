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

Paper metadata, conversations, memory, selections, annotations, and reading state are stored in the browser's local IndexedDB database. Lightweight display and provider preferences use `localStorage`. There is no cloud sync or telemetry in version 0.7.0.

## Native bridge

The bridge accepts only fixed, schema-validated actions and constructs fixed Codex/API requests. It must not accept shell strings or arbitrary commands. Logs must exclude API keys, authentication tokens, private document text, and unredacted local paths.

## Reporting a vulnerability

Please do not open a public issue for a credential leak or exploitable vulnerability. Use GitHub's private vulnerability reporting feature once the public repository is enabled.

Include affected versions, reproduction steps, expected impact, and any suggested mitigation. Do not include live credentials or private documents.
