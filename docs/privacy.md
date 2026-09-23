# PaperFlow AI Privacy Notice

Last updated: 2026-09-23

PaperFlow AI is a local-first Chrome extension. It does not operate a PaperFlow
account service, analytics service, advertising service, or telemetry backend.

## Data stored on the device

PaperFlow stores library metadata, collections, tags, notes, annotations,
conversations, paper memory, reading state, synchronization logs, and indexes in
the extension's IndexedDB. Saved PDFs and rebuildable OCR resources are stored
in Origin Private File System (OPFS). Lightweight interface preferences use
extension local storage.

API keys and optionally remembered vault keys are stored through the separately
installed Native Host in the operating-system credential store. Codex CLI owns
its own authentication data. PaperFlow does not read ChatGPT cookies or Codex
credential files.

## Google Drive synchronization

Synchronization is disabled until the user connects Google Drive and creates or
unlocks a vault. PaperFlow requests only the `drive.file` scope, which limits it
to files created or explicitly opened by PaperFlow.

The readable `vault.json` file contains protocol and key-derivation parameters
plus encrypted VMK wrappers. Library records are encrypted locally before
upload. Offline PDF backup is a separate setting and is disabled by default; if
enabled, those PDFs are also encrypted locally before upload. Drive object names
are opaque. Google receives ciphertext, object sizes, timestamps, the PaperFlow
folder name, and limited protocol metadata; it does not receive plaintext paper
titles, notes, annotations, conversations, or PDF bytes from PaperFlow sync.

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
- ChatGPT subscription mode sends the request to the locally authenticated
  official Codex CLI through Native Messaging.
- API mode sends it to the user-configured OpenAI-compatible HTTPS endpoint.

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
| `storage` | Store small local settings and redirect-loop guards |
| `https://arxiv.org/*` | Mount the integrated Reader while preserving the original arXiv PDF URL and site icon |
| `contextMenus` | Offer Reader, save, and Library commands |
| `nativeMessaging` | Use Codex and OS credential storage through the fixed host |
| `identity` | Request Google Drive authorization |
| `alarms` | Resume bounded background synchronization |
| Optional HTTP/HTTPS hosts | Fetch a user-opened PDF or explicitly requested metadata |

PaperFlow does not inject scripts into arbitrary web pages and does not inspect
another PDF extension's internal DOM.

## Retention and deletion

Temporary workspaces remain local and are eligible for cleanup only when they
have no protected notes, annotations, or conversations. Saved data remains until
the user deletes it and empties the relevant trash or removes the PaperFlow
Drive folder. Tombstones may remain in encrypted sync history so older devices
cannot restore deleted records.

Uninstalling the extension can remove browser-local IndexedDB and OPFS data.
Native Host uninstallers preserve credential-store entries by default. Removing
the `PaperFlow` Drive folder removes the cloud copy but does not erase local
devices.

## Contact

Security-sensitive reports should use the repository's private vulnerability
reporting channel. Do not include real credentials, recovery keys, or private
paper content in reports.
