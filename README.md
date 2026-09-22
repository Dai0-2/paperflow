<div align="center">
  <img src="public/icons/paperflow-128.png" width="72" height="72" alt="PaperFlow AI logo">
  <h1>PaperFlow AI</h1>
  <p><strong>A persistent AI research companion beside every paper.</strong></p>
  <p>Keep your browser's PDF reader. Add understanding, reasoning, and memory.</p>
  <p><strong>English</strong> · <a href="README.zh-CN.md">简体中文</a></p>
</div>

> [!IMPORTANT]
> PaperFlow AI 0.7.0 is a local Reader MVP. It includes both the original Side Panel and an extension-hosted PDF.js reader with paper-scoped AI context and persistence.

## Why PaperFlow

PaperFlow is not a generic ChatPDF clone. It can live in Chrome's Side Panel beside an existing viewer, or open a PDF in its own integrated Reader so page position, text selection, citations, and AI context can work together.

Every paper is designed to have its own long-lived workspace:

```text
Paper
├── metadata and identity
├── conversations
├── selections and notes
├── paper memory
└── reading state
```

Open the same paper days later—from a different source when identity can be resolved—and continue the same line of thought.

## Reader MVP

- Extension page at `reader.html?url=<encoded-pdf-url>` for remote PDFs, plus a local PDF picker
- Continuous, lazy PDF.js rendering with text layers, thumbnails, document outline, search navigation, zoom, fit width, download, and print
- Current-page tracking, keyboard navigation, responsive narrow-window fit, and light/dark reading surfaces without recoloring PDF pages
- Reusable PaperFlow AI workspace embedded in a resizable right panel
- Text-selection actions for asking, explaining, translating, summarizing, and saving
- PDF-coordinate annotation layer with highlight, underline, strikeout, text note, area note, and ink tools
- Annotation comments, colors, deletion, zoom-safe persistence, and offline reopening
- Annotated PDF copy export through `pdf-lib`, with standard text-note comments and JSON/Markdown fallback
- Explicit offline PDF storage in OPFS, local full-text search, and on-demand English/Simplified Chinese OCR
- Page-aware chunked context; selected text is preferred over the current page and relevant paper chunks
- Structured citations with page, label, and excerpt; citation clicks navigate the Reader
- Explicit errors for missing, blocked, encrypted, or textless PDFs
- Context-menu action **Open with PaperFlow**, plus an opt-in direct-PDF redirect setting

## Side Panel and AI

- Minimal Chrome Manifest V3 Side Panel
- Active-tab detection for arXiv, OpenReview, direct PDFs, and compatible PDF viewers
- Automatic text extraction for accessible arXiv/OpenReview PDFs
- PDF, TXT, Markdown, and image attachments from a ChatGPT-style composer menu
- Two provider modes: ChatGPT subscription through the official Codex CLI, or an OpenAI API key through the Responses API
- API keys stored in the operating-system credential store rather than Chrome extension storage
- Custom API base URL, model ID, and Responses/Chat Completions compatibility mode
- Independent English/Chinese switches for the interface and model prompts
- User-message bubbles with copy and edit-to-resend; answer copy, regenerate, save-to-memory, tags, and local feedback
- Live answer progress for ChatGPT subscription mode and token streaming for API mode
- Low-latency reasoning configuration and bounded conversation history to prevent progressive slowdowns
- Per-paper IndexedDB storage for papers, aliases, threads, messages, memory, selections, annotations, settings, and reading state
- Google Drive `drive.file` adapter and end-to-end encrypted vault setup with password, recovery key, and optional OS credential-store unlock
- Encrypted incremental sync with immutable operation batches, snapshots, Drive Changes cursors, note conflict copies, and resumable PDF uploads
- One-time migration of legacy `localStorage` conversations and notes
- First-run setup and connection diagnostics
- Research conversation with Markdown and tables
- Page-citation interaction prototype
- Selected-text context preview
- Prompt shortcuts: Translate, Summarize, Key Points, Methodology, and Limitations
- Conversation history and multiple-thread UI
- Paper Memory view
- Provider connection status and model selector UI
- Light, dark, and system themes
- Responsive layout for 360–440 px panels
- Keyboard navigation, focus states, and reduced-motion support

## Known limits

- Subscription requests still invoke `codex exec`; a persistent official Codex app server should be evaluated later.
- Generation cancellation is not yet reliable.
- Search navigates matching pages but does not yet provide a full match list or in-page match stepping.
- Citation-range highlighting is not yet rendered.
- OCR is intentionally on demand and limited to 50 pages per run.
- Remote PDFs behind login walls or restrictive CORS must be downloaded and opened locally.
- Real Google Drive two-device release validation still requires a production OAuth client ID; automated tests use an in-memory two-device Drive adapter.
- No collaboration, vector database, or account/payment system.

## Install the prototype

### Requirements

- Chrome 114 or newer on macOS, Windows, or Linux
- ChatGPT desktop app or Codex CLI for subscription mode; an OpenAI Platform API key for API mode
- Node.js 20 or newer
- pnpm 10 or newer
- Rust stable when building the Native Host from source

### Load the extension

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/paperflow-ai.git
cd paperflow-ai
pnpm install
pnpm build
cargo build --release --locked --manifest-path native-host/Cargo.toml
# macOS
bash native-host/install/install-macos.sh
# Linux
sh native-host/install/install-linux.sh
# Windows PowerShell
.\native-host\install\install-windows.ps1
```

Google Drive development builds require a Chrome Extension OAuth client ID:

```bash
cp .env.example .env.local
# Set PAPERFLOW_GOOGLE_OAUTH_CLIENT_ID in .env.local
pnpm build
```

Without a client ID, local development builds remain loadable and show Drive
sync as unconfigured. `vite build --mode release` fails closed when it is absent.

Then:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the generated `dist/` folder.
5. Pin PaperFlow AI and click its toolbar icon for the Side Panel.
6. Right-click a PDF link or page and choose **Open with PaperFlow** for the integrated Reader.

The installer registers the Rust Native Messaging host for PaperFlow's fixed extension ID. It invokes the official Codex CLI with fixed arguments for subscription mode and stores an optional API key in macOS Keychain, Windows Credential Manager, or Linux Secret Service. It never reads ChatGPT cookies or Codex authentication files. Run `codex login` in a terminal before using subscription mode.

After rebuilding or reinstalling, click **Reload** for PaperFlow AI on `chrome://extensions`. If Chrome cannot find the host, rerun the platform installer and reload the extension. See [Native Host setup](docs/native-host.md) for paths, uninstall commands, and the one-release Python fallback.

### Development preview

```bash
pnpm dev
```

Open the printed localhost URL for the Side Panel, or `/reader.html` for the Reader open screen. Resize to 360–440 px to verify narrow layouts.

## Provider architecture

PaperFlow will not read ChatGPT cookies, expose OAuth tokens to the extension, or call private ChatGPT web endpoints.

```text
Chrome Extension
       │ Chrome Native Messaging
       ▼
PaperFlow Bridge
       │
       ├── ChatGPT subscription → official Codex status/exec
       └── API key → OS credential store → OpenAI-compatible API
```

The local bridge invokes the official Codex CLI for subscription access. API keys remain in the operating-system credential store and are never returned to the extension. See [the architecture document](docs/architecture.md).

Google Drive access is separate from AI providers. Chrome Identity manages the
OAuth token with the `drive.file` scope. PaperFlow encrypts each cloud object
before upload; the vault password and recovery key are not sent to Google.

## Privacy and security

- No analytics or telemetry in the prototype
- No API keys or OAuth tokens in the repository
- No ChatGPT cookie scraping
- No unnecessary PDF uploads
- Paper context will be visible and user-controllable before transmission
- Paper data is designed to remain local by default
- Per-paper export and deletion are part of the roadmap

Please read [SECURITY.md](SECURITY.md) before adding a provider.

## Development

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm build
pnpm package
```

Project structure:

```text
src/
├── components/
│   ├── chat/
│   ├── common/
│   ├── composer/
│   ├── layout/
│   ├── paper/
│   ├── reader/
│   └── views/
├── data/
├── hooks/
├── services/
├── store/
├── styles/
└── types/
```

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

- [x] Phase 1 — production-quality UI prototype
- [x] Phase 2 alpha — active-paper detection, local persistence, and PDF attachments
- [x] Phase 3 alpha — Codex CLI bridge and ChatGPT sign-in
- [x] Phase 3.1 — OpenAI API-key provider adapter
- [x] Phase 3.2 — streaming progress, bilingual prompts, and provider compatibility controls
- [x] Phase 4 MVP — selection, current page, and structured paper context
- [x] Phase 5 MVP — IndexedDB memory, citations, and page navigation
- [x] Phase 6 alpha — Native Messaging bridge and Codex CLI sign-in
- [x] Phase 7 MVP — integrated PDF.js Reader

## Acknowledgements

PaperFlow's provider and local-bridge research was informed by the open-source [AIdea for Zotero](https://github.com/Visterainer/aidea-zotero) project. PaperFlow is an independent implementation for Chrome and does not copy AIdea's source code.

The integrated Reader uses Mozilla PDF.js (`pdfjs-dist`) under the Apache License 2.0. The license is shipped as `pdfjs-LICENSE.txt` in the extension package. Google Scholar PDF Reader is an interaction reference only; no Google extension code or assets are included.

## License

The open-source license will be selected before the first public release.
