# Changelog

## 1.0.10 - 2026-09-24

- Added an in-product device login guide for ChatGPT and Google Drive setup.
- The guide detects the current extension ID, explains stable-ID device builds,
  Native Host installation, Codex CLI login, and Google Drive connection.
- Login failures now expose direct actions for Chrome extension management,
  PaperFlow settings, and copying the required Codex commands.

## 1.0.9 - 2026-09-24

- Reworked the product website around a Paper-inspired editorial system with a
  centered 1080px canvas, warm grid background, lighter type hierarchy, and
  self-hosted Inter fonts.
- Rebuilt the product walkthrough as a 15-second H.264 video covering browser
  reading, annotations, contextual AI, project-based paper organization, and
  encrypted Google Drive sync.
- Made research projects and nested collection management explicit in the
  website's library story.

## 1.0.8 - 2026-09-24

- Rebuilt the product website around five concrete workflows: browser reading,
  annotation, library organization, contextual AI, and Google Drive sync.
- Removed forced mobile image widths so every product screenshot preserves its
  natural aspect ratio on desktop and mobile.
- Added high-resolution annotation and AI detail views derived from the real
  *Attention Is All You Need* PaperFlow session.
- Added a 16-second, 1280x720 product walkthrough made entirely from real
  PaperFlow interface captures.

## 1.0.7 - 2026-09-24

- Renamed the Zotero-inspired appearance option to White while preserving
  existing theme preferences.
- Expanded interface text sizing from 75% to 160%, added one-step adjustments
  and reset controls, and applied scaling consistently across the Side Panel,
  Reader, Library, and recovery views without changing PDF typography.
- Replaced the website and README hero image with a high-resolution real
  PaperFlow session displaying *Attention Is All You Need*.
- Simplified the public website to a clean white presentation and renamed the
  GitHub repository and Pages site from `paperflow-ai` to `paperflow`.

## 1.0.6 - 2026-09-24

- Added recovery rendering for AI answers that emit LaTeX inside bare square
  or round brackets instead of standard math delimiters.
- Preserved formula contents while normalizing consecutive display equations.
- Instructed both Codex subscription and API providers to use `$...$` and
  `$$...$$` consistently for future mathematical answers.

## 1.0.5 - 2026-09-24

- Made the public PaperFlow Google OAuth client ID part of every extension
  build, including the default local `dist` build.
- Kept environment overrides for alternate registered OAuth clients while
  preventing local builds from silently disabling Google Drive sync.

## 1.0.4 - 2026-09-24

- Added local KaTeX rendering for inline and display mathematics in AI answers.
- Added compatibility for `$...$`, `$$...$$`, `\(...\)`, and `\[...\]`
  delimiters while preserving literal formulas inside code blocks.
- Reduced Markdown heading sizes inside the AI panel and made long display
  formulas horizontally scrollable without deforming the panel.

## 1.0.3 - 2026-09-24

- Added first-run ChatGPT sign-in through the fixed, allow-listed
  `codex login` Native Host action.
- Added a complete macOS device-test package with a stable extension ID,
  Google Drive OAuth, Native Host installer, and installation guide.
- Made remote PDFs display as soon as PDF.js can render the first page instead
  of waiting for a full-file download and content hash.
- Preserved the selected text or viewport focus while zooming.
- Added an onboarding settings entry, Zotero white theme, interface font
  family and text-size controls.
- Made the Reader AI panel resize continuously with container-aware narrow
  layouts and safe width limits across viewport changes.

## 1.0.2 - 2026-09-24

- Replaced the default password-based vault setup with one-click Google account
  sign-in and automatic cross-device sync.
- Added automatic account-managed key recovery for library records, notes,
  annotations, conversations, reading progress, and optional PDFs.
- Added a one-time compatibility migration for existing password/recovery-key
  sync data without re-encrypting historical objects.
- Updated privacy and store disclosures to describe the Google account security
  boundary accurately.
- Replaced the warm paper tint with a Zotero-inspired white and neutral-gray
  interface palette across the Library, Reader, and side panel.

## 1.0.1 - 2026-09-23

### Fixed

- Preserve the browser receiver when the Google Drive client invokes `fetch`,
  preventing `Illegal invocation` during vault connection.

## 1.0.0 - 2026-09-22

### Added

- Zotero-style Library with nested collections, tags, favorites, reading
  status, bulk actions, duplicate review, metadata editing, and virtualized
  lists.
- BibTeX/RIS import and export plus APA, MLA, Chicago, IEEE, and BibTeX copy.
- User-confirmed AI organization suggestions.
- OPFS PDF storage, content-hash deduplication, local full-text search, and
  on-demand local English/Simplified Chinese OCR.
- Highlight, underline, strikeout, text, area, and ink annotations in PDF
  coordinates, plus annotated PDF/JSON/Markdown export.
- End-to-end encrypted Google Drive vault with password and recovery-key unlock.
- Incremental synchronization with immutable batches, snapshots, Drive Changes,
  deterministic merges, note conflict copies, MV3 checkpoints, and resumable
  encrypted PDF transfer.
- Rust Native Messaging host and installers for macOS, Windows, and Linux.
- Context-menu commands for Reader, Library save, and Library open flows.
- Read-only database recovery page and atomic v0.7 migration backup.
- Release artifact auditing for MV3 dynamic code, remote dependencies, source
  maps, credentials, logs, and local paths.

### Changed

- Migrated the local data layer to versioned Dexie schemas and repositories.
- Saved papers now synchronize; temporary workspaces remain local.
- API keys and remembered vault keys use the operating-system credential store.
- OpenAI-compatible provider setup now exposes Base URL, model ID, and API
  format during onboarding and tests the configured endpoint after saving.
- HTTP/HTTPS access is optional and requested for the user-selected origin.
- OCR dependencies are patched to fail closed without local worker, core, and
  language paths; dynamic `Function` compatibility branches are removed.
- Version raised from `0.7.0` to `1.0.0`.

### Security

- Google authorization is limited to `drive.file`.
- Drive business objects and filenames are encrypted or opaque.
- Native Host actions are schema-validated and do not accept shell commands,
  executable paths, arbitrary arguments, or caller-controlled environment.
- Extension bundles contain no runtime CDN dependency, `eval`, or
  `Function` constructor.

### Upgrade notes

- The IndexedDB upgrade preserves a raw v1 snapshot in
  `migrationBackups/v1-pre-upgrade`.
- Database schemas are not downgraded automatically. See
  [Migration and Rollback](docs/migration-and-rollback.md).
- The Python Native Host remains a compatibility fallback for this release;
  new installations should use the Rust host.

## 0.7.0

- Added the PDF.js Reader MVP, shared AI workspace, page-aware context,
  selection actions, citation navigation, and initial IndexedDB persistence.
