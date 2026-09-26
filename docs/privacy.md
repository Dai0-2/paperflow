# PaperFlow AI Privacy Notice

Last updated: 2026-09-26

PaperFlow AI is a local-first Chrome extension. It does not operate a PaperFlow
account service, analytics service, advertising service, or telemetry backend.

## Data stored on the device

PaperFlow stores library metadata, collections, tags, notes, annotations,
conversations, paper memory, reading state, synchronization logs, and indexes in
the extension's IndexedDB. Saved PDFs and rebuildable OCR resources are stored
in Origin Private File System (OPFS). Lightweight interface preferences use
extension local storage.

OpenAI-compatible API keys are stored in extension-local Chrome storage on the
current device, are restricted to trusted extension contexts when supported by
Chrome, and are never synchronized. This is less isolated than an
operating-system credential store; users should prefer scoped, revocable keys.
Codex CLI owns its authentication data. PaperFlow does not read ChatGPT
cookies. In subscription mode, the separately installed open-source Native
Host reads the local Codex credential file into process memory so it can
authenticate a request without exposing the token to Chrome. PaperFlow does not
copy that token into extension storage, IndexedDB, OPFS, Drive, or an
operating-system credential store.

## Google Drive synchronization

Synchronization is disabled until the user signs in with Google. PaperFlow
requests only the `drive.file` scope, which limits it to files created or
explicitly opened by PaperFlow.

The readable `vault.json` file contains the synchronization identifier and
account-managed encryption key material. Library records are encrypted locally
before upload. Offline PDF backup is a separate setting and is disabled by
default; if enabled, those PDFs are also encrypted locally before upload. Drive
object names are opaque. Plaintext paper titles, notes, annotations,
conversations, and PDF bytes are not written directly to Drive objects.

This encryption prevents ordinary Drive browsing from revealing synchronized
content, but it is not zero-knowledge encryption: anyone who can access the
Google account and its PaperFlow-created Drive files can obtain the key material
and restore the data. The Google account's sign-in and security controls protect
cross-device recovery.

OAuth access tokens remain managed by Chrome Identity and are not written to
IndexedDB, OPFS, logs, exports, or Drive.

## AI providers

AI requests occur only after a user sends a message or explicitly invokes an AI
organization action.

- Reader chat may send the visible selected text, current-page text, paper
  metadata, relevant bounded chunks, conversation history, and user-selected
  attachments to the configured provider.
- AI organization sends title, author, abstract, and existing labels. It does
  not send PDF full text, private notes, or annotations.
- ChatGPT subscription mode sends the request through Native Messaging to the
  local PaperFlow Native Host. The Host uses the local Codex OAuth credential
  and sends a tool-free request directly to the fixed ChatGPT Codex Responses
  endpoint. It does not load user MCP servers, plugins, tools, or shell access.
- API mode sends it directly from the extension to the user-configured
  OpenAI-compatible HTTPS endpoint. PaperFlow requests access only to that API
  origin when the user saves or tests the configuration.

The selected AI provider processes this data under its own terms and privacy
policy. PaperFlow does not proxy those requests through a PaperFlow server.

## External metadata services

When the user requests metadata refresh, PaperFlow may send a DOI, arXiv ID, or
OpenReview ID to Crossref, arXiv, or OpenReview respectively. Chrome asks for
the required optional host permission before the request.

## Permissions

| Permission | Purpose |
|---|---|
| `sidePanel` | Show the research workspace beside the active tab |
| `tabs` | Identify the active paper and open Reader or Library tabs |
| `storage` | Store local settings, redirect-loop guards, and an optional device-local API key |
| `https://arxiv.org/*` | Mount the integrated Reader while preserving the original arXiv PDF URL and site icon |
| `contextMenus` | Offer Reader, save, and Library commands |
| `nativeMessaging` | Use an optional local Native Host for ChatGPT subscription access through Codex |
| `identity` | Request Google Drive authorization |
| `alarms` | Resume bounded background synchronization |
| Optional HTTP/HTTPS hosts | Connect to a user-selected API provider, fetch a user-opened PDF, or refresh requested metadata |

PaperFlow does not inject scripts into arbitrary web pages and does not inspect
another PDF extension's internal DOM.

## Retention and deletion

Temporary workspaces remain local and are eligible for cleanup only when they
have no protected notes, annotations, or conversations. Saved data remains until
the user deletes it and empties the relevant trash or removes the PaperFlow
Drive folder. Tombstones may remain in encrypted sync history so older devices
cannot restore deleted records.

Uninstalling the extension can remove browser-local IndexedDB, OPFS data, and
the device-local API key. Removing the `PaperFlow` Drive folder removes the
cloud copy but does not erase local devices.

## Contact

Security-sensitive reports should use the repository's private vulnerability
reporting channel. Do not include real credentials or private paper content in
reports.
