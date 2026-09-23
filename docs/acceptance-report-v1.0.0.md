# PaperFlow AI v1.0.0 Acceptance Report

Date: 2026-09-22

## Verdict

The repository implementation and locally automatable release gate pass for
version 1.0.0. The generated extension and macOS arm64 Native Host artifacts
are unsigned development artifacts. They are not Chrome Web Store production
artifacts because no production OAuth client or code-signing identity was
provided.

## Automated Evidence

| Check | Result |
|---|---|
| TypeScript strict build | Pass |
| Unit and integration tests | 26 files, 70 tests passed |
| Chromium E2E against production `dist/` | 10 tests passed |
| 10,000-paper virtualized library/filter smoke test | Pass; full test completed in 651 ms on this machine |
| Local OCR cancellation and restart | Pass |
| Annotation persistence and readable PDF-copy export | Pass |
| Cross-device encrypted PDF restore into local OPFS | Pass with an encrypted in-memory Drive adapter |
| AI answer-to-note action and model selector UI | Pass |
| Raw IndexedDB recovery export | Pass |
| Production extension build | Pass; 2,576 modules transformed |
| Release static audit | Pass; 47 packaged files |
| Rust formatting | Pass |
| Rust unit/property tests | 13 tests passed |
| Rust Clippy with warnings denied | Pass |
| Rust macOS arm64 release build | Pass |
| Native Host isolated install/uninstall | Pass |

The browser suite uses a production Vite preview rather than the development
server, so dependency optimization and HMR cannot invalidate IndexedDB or OCR
measurements. Generated PDF fixtures exercise local upload, rendering, OCR,
annotation persistence, and exported-PDF readability.

## Security and Packaging Evidence

- Manifest V3 is enforced and the OAuth allowlist is limited to `drive.file`.
- The release scanner rejects source maps, logs, tests, private-key formats,
  credential patterns, local absolute paths, dynamic `eval`/`Function`, CDN
  dependency URLs, and remote executable imports.
- Tesseract worker, WebAssembly core, and English/Simplified Chinese language
  data are packaged locally. Missing paths fail closed.
- The manifest public key resolves to extension ID
  `baddhdmpdljpcmnbpfgiegmgkmdbodie`; all Native Host manifests are checked
  against that ID.
- API keys and remembered vault keys remain behind the Native Host and the OS
  credential store. They are not present in the extension archive.

## Local Artifacts

| Artifact | SHA-256 |
|---|---|
| `outputs/v1.0.0/paperflow-ai-v1.0.0-unsigned.zip` | `7c87337e2a1f1d5c2b66e416a29146345dadacfe5d16286df6f1a937b75513ca` |
| `outputs/v1.0.0/paperflow-native-host-macos-arm64-unsigned.tar.gz` | `1f4e16ca6aee0c6cf794df53ce8babdbf74952040fd72437041a708a750d9bfe` |

The same extension package supports both a fresh install and an in-place
v0.7.0-to-v1.0.0 upgrade. Upgrade behavior differs through the existing
IndexedDB schema, not through a separate binary.

## External Gates Not Executed

These items require credentials, hardware, accounts, or publishing services
that are not available in this checkout. They are deliberately not reported as
passing:

- production Google OAuth build and consent-screen verification;
- real two-device/two-profile Google Drive synchronization and interrupted
  resumable upload;
- public arXiv, authenticated, cross-origin, encrypted, and scanned-PDF manual
  matrix in a clean Chrome profile;
- the full 500-collection, 2,000-tag, 50,000-note/annotation, and
  1,000,000-page-chunk performance profile with warm-search p95 and scroll FPS
  on target 8 GB hardware;
- Windows and Linux native builds outside CI;
- Apple notarization, Windows Authenticode, and Linux package signing;
- Chrome Web Store upload, privacy-policy hosting, review, and approval.

The CI matrix is configured to build and test macOS, Windows, and Linux
development packages and emit checksums. A tagged OAuth-enabled extension
artifact is produced only after the main Web test job succeeds and only when
`PAPERFLOW_GOOGLE_OAUTH_CLIENT_ID` is supplied by repository secrets.

## Known Non-Blocking Issue

The Citation.js bundle is 756 KB minified and triggers Vite's 500 KB chunk
warning. It is lazy-loaded by the import/export flow and does not block the
release gate, but further splitting should be considered for a later version.
