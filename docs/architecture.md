# Architecture

## Product boundary

PaperFlow has two compatible surfaces:

1. The Chrome Side Panel detects the paper in the active tab and works beside Chrome PDF Viewer, arXiv, OpenReview, or another reader.
2. The extension-hosted `reader.html` renders a PDF with PDF.js and embeds the same AI workspace. Users enter this mode explicitly through the file picker, context menu, Reader URL, or the opt-in direct-PDF setting.

PaperFlow does not inspect another extension's DOM, use Google Scholar private APIs, or include Google Scholar PDF Reader code or assets.

## Components

```text
Existing PDF/web tab                  PaperFlow Reader
        │ active-tab metadata          │ PDF.js pages/text/outline
        ▼                              │ current page and selection
Chrome Side Panel                     ▼
        └──────── shared WorkspaceSurface ────────┐
                                                  │ bounded context
                IndexedDB                         ▼
          papers / aliases / threads       Provider adapter
          messages / memory / selections      ├─ Codex Bridge
          annotations / settings              └─ OpenAI-compatible API
                │                                 │
                │ encrypted object queue          ▼
                ▼                      OS credential store / Codex credentials
        Google Drive adapter
                │ drive.file + Chrome Identity
                ▼
      visible PaperFlow folder
      vault.json + opaque *.pfo objects
```

`ReaderApp` is an orchestration component. PDF loading, host permission checks,
metadata extraction, and page text extraction live in `usePdfDocument`.
Navigation, current-page observation, zoom restoration, keyboard handling, and
reading-state persistence live in `useReaderNavigation`. Reader and Side Panel
both render the same `WorkspaceSurface`, store, chat hooks, and provider adapter.

The annotation layer stores text quads, regions, and ink strokes in PDF user
space. `PageViewport` converts those coordinates only while rendering, so zoom
and page rotation do not rewrite persisted records. Only lazily rendered pages
mount an annotation overlay. `pdf-lib` produces a new annotated copy; the OPFS
source object is never modified. Text notes are also emitted as standard PDF
`/Text` annotations, and unsupported PDFs fall back to JSON and Markdown.

## PDF loading and context

- Remote documents require a matching host permission. arXiv and OpenReview are
  predeclared; other HTTP/HTTPS origins are requested only when the user opens a
  PDF from that host.
- Local files are loaded from a user-selected `File` and are not uploaded by the
  Reader.
- Pages render lazily. Text extraction yields page-addressable chunks with
  optional section labels rather than one unconditional full-document prompt.
- Context selection prefers the explicit text selection, then the visible page,
  metadata, and a bounded set of relevant chunks.
- Assistant citations use `{ page, label, excerpt }`. The Reader handles the
  shared `paperflow:navigate-page` event to jump to a cited page.

## Persistence

IndexedDB database `paperflow-ai` contains:

| Store | Purpose |
|---|---|
| `papers` | Canonical metadata and reading state |
| `paperAliases` | DOI, arXiv, OpenReview, title-author, URL, and content-hash aliases |
| `threads` | Paper-scoped conversations |
| `messages` | Ordered, thread-scoped chat messages |
| `paperMemory` | User-saved durable notes |
| `selections` | User-selected page text |
| `annotations` | Six annotation types with PDF geometry, text anchors, and comments |
| `settings` | Extensible structured settings |
| `collections` / `collectionItems` | Nested library organization and paper membership |
| `tags` / `paperTags` | Normalized labels and paper relationships |
| `documents` | PDF identity, OPFS availability, and encrypted remote state |
| `notes` | Markdown notes and deterministic conflict copies |
| `paperChunks` / `ocrPages` | Rebuildable page text and OCR records |
| `syncOps` | Immutable local operation log keyed by device ID and sequence |
| `syncState` | Lamport counter, Drive Changes cursor, retry, and last-success state |
| `syncCheckpoints` | Recoverable sync-run and resumable-upload progress |
| `syncConflicts` | Unresolved note conflict-copy notifications |
| `migrationBackups` | Local raw v0.7 snapshot retained across the first v1 startup |

Legacy `paperflow:messages:*` and `paperflow:notes:*` values migrate once after a
paper workspace opens. Lightweight UI preferences remain in `localStorage`.
The v1 IndexedDB upgrade copies every legacy store into
`migrationBackups/v1-pre-upgrade` before modifying records in the same atomic
upgrade transaction. If opening the final schema fails, all main surfaces stop
and redirect to the read-only `recovery.html` exporter. Schemas are never
automatically downgraded.

## Google Drive vault

`manifest.base.json` is the checked-in source of extension permissions. A Vite
plugin generates `dist/manifest.json` and injects the non-secret Chrome Extension
OAuth client ID only when `PAPERFLOW_GOOGLE_OAUTH_CLIENT_ID` is set. The only
Google scope is `https://www.googleapis.com/auth/drive.file`. Chrome Identity
owns access-token persistence; PaperFlow requests a token per Drive operation
and never writes it to application storage.

The Drive adapter creates a user-visible `PaperFlow` folder. `vault.json` is the
only readable protocol file and contains no paper data. It stores a randomly
generated 256-bit Vault Master Key wrapped independently by:

- a password-derived AES key using PBKDF2-HMAC-SHA-256, a random 128-bit salt,
  and 600,000 iterations;
- a recovery-derived AES key using HKDF-SHA-256 and a random 256-bit Base32
  recovery key shown once.

Every business object gets a separate random 256-bit key. Content is split into
independently authenticated AES-256-GCM chunks with unique 96-bit nonces. AAD
binds the vault ID, protocol version, object type, logical ID, and chunk index.
The object key is wrapped by a domain-separated VMK subkey. A second
domain-separated HMAC key derives the opaque `*.pfo` Drive filename, so paper
titles, DOI values, authors, notes, and attachment names do not appear in Drive
metadata.

The VMK is held in memory for the unlocked browser session. If the user
explicitly enables **Remember this device**, the Native Host stores the VMK in
the operating-system credential store under the vault UUID. Browser storage and
Drive never receive the plaintext VMK, password, recovery key, API key, or OAuth
token. Changing the vault password replaces only the password wrapper and does
not re-encrypt historical objects.

## Incremental synchronization

Every saved-library mutation writes its entity and a `[deviceId, seq]`
operation in the same Dexie transaction. Operations are grouped after a
five-second debounce into immutable encrypted batches. Replaying an operation
is safe because its ID is unique and retained locally after application.
Entity versions are Lamport tuples; relationship rows and annotations merge
independently, paper identity fields preserve non-empty trusted metadata, and
concurrent note edits create deterministic conflict copies.

New devices read the latest encrypted snapshot and then replay encrypted
batches. Established devices use the persisted Google Drive Changes page token.
The TypeScript MV3 service worker runs on startup, network recovery, local
change alarms, manual requests, and a 15-minute alarm. A run uses a 20-second
soft budget and checkpoints each network stage.

Encrypted PDF objects use Drive resumable uploads. The encrypted temporary
payload remains in OPFS, while the resumable session URL, confirmed byte offset,
and current chunk hash are checkpointed in IndexedDB. OAuth tokens and plaintext
vault keys are never checkpointed. HTTP 401 requires user reauthorization,
403 pauses uploads, and 429 honors `Retry-After` with full-jitter backoff.

## ChatGPT subscription authentication

A Chrome extension cannot safely launch arbitrary local executables. It also must not read ChatGPT cookies or store Codex OAuth access tokens. The supported design is a separately installed, open-source native host:

1. The extension connects to the Rust PaperFlow Native Host using Chrome Native Messaging.
2. The extension probes protocol version 1 and validates requests and responses with Zod; the host validates them again with Serde.
3. The host checks authentication with `codex login status`. Interactive login is run explicitly by the user as `codex login` in a terminal.
4. Codex CLI manages its own credentials.
5. PaperFlow sends bounded paper context to the host.
6. The host invokes `codex exec --json --ephemeral --sandbox read-only` with a fixed argument list and forwards sanitized JSONL events.

The extension never receives or persists the Codex access token. The bridge must never read or return `~/.codex/auth.json`.

## Native host security requirements

- Allow only the published PaperFlow extension ID.
- Use Native Messaging; do not expose an unauthenticated localhost HTTP port.
- Validate message schemas and enforce maximum payload sizes.
- Use a fixed allowlist of Codex arguments; never accept raw CLI arguments or shell strings from the extension.
- Run Codex with read-only sandboxing and ephemeral sessions for paper chat.
- Redact secrets and local paths from logs.
- Show the exact paper context before transmission.
- Support cancellation and timeouts.
- Keep credentials in the OS credential store whenever possible.
- Use macOS Keychain, Windows Credential Manager, or Linux Secret Service. If Secret Service is unavailable, disable persistence instead of writing plaintext.

The Rust host uses protocol version 1 and the fixed host name `com.paperflow.ai`.
The previous Python host remains a one-release compatibility fallback; new
installations use the Rust binary. See [Native Host](native-host.md).

## Paper identity

```text
DOI → arXiv ID → OpenReview ID → normalized title + first author → PDF URL → content hash
```

Aliases should point to one canonical paper record so the same paper reopens the same workspace across sources.

Google Scholar PDF Reader URLs with extension ID
`dahenjhkoodjbpjheillcadbppiidmhp` are treated as public URL wrappers only.
PaperFlow may recover `file`, `url`, or `pdf` query parameters, but does not
access the extension's pages or internal state.

## Build and third-party code

Vite builds `index.html`, `reader.html`, `library.html`, and `recovery.html` as
separate entries with shared React and PDF.js chunks. It also emits the extension
manifest from `manifest.base.json`. A release build fails closed when its Google
OAuth client ID is missing. The `pdf-lib` exporter is loaded only when the user
requests an annotated copy. MV3 CSP does not require a runtime CDN or `eval`.
Mozilla PDF.js is bundled from `pdfjs-dist` under Apache License 2.0; its license
is copied to `dist/pdfjs-LICENSE.txt`.

Tesseract worker, WebAssembly core, and language data are packaged under
`dist/ocr`. Locked pnpm patches remove upstream CDN defaults and dynamic
`Function` compatibility probes from Tesseract.js, Zod, and Regenerator Runtime.
`scripts/audit-release.mjs` fails the build when release files contain source
maps, dynamic code, remote dependency hosts, credential patterns, logs, test
data, or local absolute paths.
