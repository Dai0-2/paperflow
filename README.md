<div align="center">
  <a href="https://dai0-2.github.io/paperflow/">
    <img src="public/icons/paperflow-128.png" width="84" height="84" alt="PaperFlow logo">
  </a>
  <h1>PaperFlow</h1>
  <p><strong>Read where you find papers. Think where you read them.</strong></p>
  <p>A browser-native research workspace for Chrome.</p>
  <p>
    Read, annotate, ask, remember, and organize papers without leaving the browser.
  </p>
  <p>
    <a href="https://chromewebstore.google.com/detail/paperflow-ai/dffiahjmpkmellmjijffpcofoahbccoc"><strong>Add to Chrome</strong></a>
    &nbsp;&nbsp;·&nbsp;&nbsp;
    <a href="https://dai0-2.github.io/paperflow/"><strong>Visit website</strong></a>
    &nbsp;&nbsp;·&nbsp;&nbsp;
    <a href="#build-from-source"><strong>Build from source</strong></a>
  </p>
  <p>
    <strong>English</strong>
    &nbsp;·&nbsp;
    <a href="README.zh-CN.md">简体中文</a>
  </p>
  <p>
    <a href="https://github.com/Dai0-2/paperflow/actions/workflows/build.yml"><img src="https://github.com/Dai0-2/paperflow/actions/workflows/build.yml/badge.svg" alt="Build status"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-202020" alt="Apache 2.0 license"></a>
    <img src="https://img.shields.io/badge/version-1.0.10-326bd1" alt="Version 1.0.10">
    <img src="https://img.shields.io/badge/Chrome-MV3-347556" alt="Chrome Manifest V3">
    <img src="https://img.shields.io/badge/storage-local--first-606460" alt="Local-first storage">
  </p>
</div>

<a href="https://dai0-2.github.io/paperflow/">
  <img src="website/assets/paperflow-attention-reader.png" alt="PaperFlow Reader displaying Attention Is All You Need with page thumbnails, annotation tools, and a source-aware assistant">
</a>

## Your PDF is the workspace

Research is often split across a PDF viewer, notes, a detached chatbot, browser
tabs, and a separate reference manager. PaperFlow brings those parts together
around the paper itself.

```text
Paper
├── metadata and identity
├── reading state
├── annotations and notes
├── source-linked conversations
└── Paper Memory
```

Open an arXiv paper where you found it, keep the original URL, and work inside
one persistent browser workspace. Return later and the paper still has its
position, notes, conversations, and saved context.

## AI that stays connected to the paper

<img src="website/assets/paperflow-source-stage.png" alt="PaperFlow showing a question, page citation, and the corresponding source passage in the PDF">

Select text, ask a focused question, and receive a concise answer beside the
document. PaperFlow builds context from the selection, current page, and
relevant paper chunks. Structured citations link back to the cited page in the
Reader.

- Page-aware context instead of a detached chat upload
- Streaming answers with Markdown, tables, and research prompt shortcuts
- ChatGPT subscription support through the official Codex CLI
- OpenAI-compatible API support with a custom base URL and model ID
- API keys stored in the operating-system credential store

## Think directly on the paper

<img src="website/assets/paperflow-annotations.png" alt="PaperFlow annotation tools over a research paper">

Highlight, underline, strike out, write a text note, capture an area, or draw
with ink. Annotations stay anchored in PDF coordinates, survive zoom changes,
and reopen with the paper.

Annotated work can be exported as a PDF copy, JSON, or Markdown. Local
full-text search and on-demand English and Simplified Chinese OCR are available
for papers that need them.

## Every paper remembers

PaperFlow treats each paper as a long-lived research object rather than a
temporary chat session.

| Persistent context | What is retained |
| --- | --- |
| Reading | Current page, position, and reader state |
| Evidence | Selections, annotations, comments, and notes |
| Conversation | Multiple threads, messages, and page citations |
| Memory | Saved insights and concise paper context |
| Identity | Metadata and source aliases for recognizing the same paper |

## Your papers become a research system

<img src="website/assets/paperflow-library-system.png" alt="PaperFlow research library with collections, tags, status, search, and paper details">

The library uses a dense research-table interface designed for scanning and
repeated work:

- Nested collections, tags, favorites, reading status, and reading history
- Field-aware search, duplicate review, trash, and bulk actions
- BibTeX and RIS import/export
- APA, MLA, Chicago, IEEE, and BibTeX citation copy
- Markdown notes, annotation summaries, attachments, and Paper Memory
- User-reviewed organization suggestions that never change the library silently

## Your research stays yours

PaperFlow is local-first. It does not operate a document backend.

```mermaid
flowchart LR
    B["Chrome + PaperFlow"] --> L["Local storage<br/>IndexedDB + OPFS"]
    L -. "optional · encrypted before upload" .-> D["Your Google Drive"]
    B --> H["Local native host"]
    H --> C["ChatGPT subscription<br/>via official Codex CLI"]
    H --> A["OpenAI-compatible API"]
```

- Paper metadata, reading state, notes, annotations, conversations, and memory
  remain local by default.
- Optional Google Drive sync uses the minimum `drive.file` scope and stores
  encrypted objects in the user's own `PaperFlow` folder.
- Offline PDF backup is separately controlled and disabled by default.
- PaperFlow does not scrape ChatGPT cookies or call private ChatGPT web
  endpoints.
- Local OCR has no runtime CDN or remote-code dependency.

Read the [privacy notice](docs/privacy.md), [security policy](SECURITY.md), and
[architecture document](docs/architecture.md).

## Install

### Core workspace

[Install PaperFlow from the Chrome Web Store](https://chromewebstore.google.com/detail/paperflow-ai/dffiahjmpkmellmjijffpcofoahbccoc).

PaperFlow supports Chrome 114 or newer on macOS, Windows, and Linux. The
integrated Reader handles local and remote PDFs; arXiv PDF pages retain their
original `arxiv.org/pdf/...` address while PaperFlow runs in the page.

The Reader, annotations, research library, local storage, and Google Drive sync
work directly from the extension. They do not require the Native Host.

### Connect a ChatGPT subscription

AI providers are optional. ChatGPT subscription mode requires:

1. The official Codex CLI.
2. The PaperFlow Native Host.
3. A one-time browser sign-in from PaperFlow.

Install the official Codex CLI:

```bash
# macOS / Linux
npm install -g @openai/codex

# Windows PowerShell
npm.cmd install -g @openai/codex
```

Chrome Web Store extensions cannot install or launch local executables by
themselves. The Native Host is therefore installed separately. It invokes only
the official Codex CLI and never exposes Codex authentication data to the
extension.

> [!NOTE]
> Signed one-click Native Host installers are not publicly available yet.
> Until they are released, build and install only the host from source:

```bash
git clone https://github.com/Dai0-2/paperflow.git
cd paperflow
cargo build --release --locked --manifest-path native-host/Cargo.toml
```

```bash
# macOS
bash native-host/install/install-macos.sh

# Linux
sh native-host/install/install-linux.sh

# Windows PowerShell
.\native-host\install\install-windows.ps1
```

Open PaperFlow, choose **ChatGPT subscription**, and select
**Sign in with ChatGPT**. PaperFlow starts the official Codex browser
authorization flow; running `codex login` separately is not normally required.

OpenAI-compatible API mode also uses the Native Host so API keys can remain in
the operating-system credential store. Google Drive sync does not use the
Native Host.

See [Native Host setup](docs/native-host.md) for installation and
troubleshooting.

### Build the extension from source

This path is for contributors and users testing an unreleased build. It is not
required after installing from the Chrome Web Store.

Requirements: Node.js 20+, pnpm 10+, and Rust stable.

```bash
git clone https://github.com/Dai0-2/paperflow.git
cd paperflow
pnpm install
pnpm build
cargo build --release --locked --manifest-path native-host/Cargo.toml
```

Run the Native Host installer shown above. Then open `chrome://extensions`,
enable **Developer mode**, choose **Load unpacked**, and select `dist/`.

## Development

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
pnpm audit:release
pnpm test:e2e
```

The extension is built with React, TypeScript, PDF.js, Dexie, Zustand, and
Chrome Manifest V3. The native bridge is written in Rust.

## Current limits

- Remote PDFs behind login walls or restrictive CORS must be opened locally.
- OCR is intentionally on demand and processes up to 50 pages per run.
- Search locates matching pages but does not yet provide full in-page result
  stepping.
- Citation clicks navigate to the cited page; precise citation-range
  highlighting is not yet available.
- PaperFlow currently has no collaboration, vector database, or account/payment
  system.

## Contributing

Issues and pull requests are welcome. Start with
[CONTRIBUTING.md](CONTRIBUTING.md), then review the
[release checklist](docs/release-checklist.md) before shipping a build.

## License

PaperFlow is open source under the [Apache License 2.0](LICENSE). Bundled
dependencies retain their own licenses; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
