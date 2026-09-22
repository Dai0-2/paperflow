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
                                                  │
                                      macOS Keychain / Codex credentials
```

`ReaderApp` is an orchestration component. PDF loading, host permission checks,
metadata extraction, and page text extraction live in `usePdfDocument`.
Navigation, current-page observation, zoom restoration, keyboard handling, and
reading-state persistence live in `useReaderNavigation`. Reader and Side Panel
both render the same `WorkspaceSurface`, store, chat hooks, and provider adapter.

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
| `annotations` | Saved selection annotations |
| `settings` | Extensible structured settings |

Legacy `paperflow:messages:*` and `paperflow:notes:*` values migrate once after a
paper workspace opens. Lightweight UI preferences remain in `localStorage`.

## ChatGPT subscription authentication

A Chrome extension cannot safely launch arbitrary local executables. It also must not read ChatGPT cookies or store Codex OAuth access tokens. The supported design is a separately installed, open-source native host:

1. The extension connects to PaperFlow Bridge using Chrome Native Messaging.
2. The bridge checks authentication with `codex login status`.
3. On explicit user action, the bridge launches `codex login` or `codex login --device-auth`.
4. Codex CLI opens the browser login flow and manages credentials.
5. PaperFlow sends bounded paper context to the bridge.
6. The bridge invokes `codex exec --json --ephemeral --sandbox read-only` and forwards sanitized JSONL events.

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

Vite builds `index.html` and `reader.html` as separate entries with shared React
and PDF.js chunks. MV3 CSP does not require a runtime CDN or `eval`.
Mozilla PDF.js is bundled from `pdfjs-dist` under Apache License 2.0; its license
is copied to `dist/pdfjs-LICENSE.txt`.
