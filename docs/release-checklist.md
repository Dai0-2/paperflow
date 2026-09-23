# PaperFlow AI v1.0 Release Checklist

This checklist separates repository validation from external publication work.
Do not mark an external item complete without evidence from the relevant
account, device, or signing service.

## Repository gate

- [x] `package.json` and generated manifest use `1.0.0`.
- [x] TypeScript strict check passes.
- [x] Unit and integration tests pass.
- [x] Chromium E2E suite passes for Side Panel-sized UI, Reader, Library,
  annotations, offline PDF, vault UI, and bilingual entry points.
- [x] Production build and extension ZIP complete.
- [x] `pnpm audit:release` rejects source maps, dynamic code, remote dependency
  URLs, credential patterns, logs, tests, and local absolute paths.
- [x] OCR worker, core, and English/Simplified Chinese data are local.
- [x] Rust formatting, tests, Clippy with warnings denied, and release build pass
  on the local platform.
- [x] README, architecture, security, privacy, sync, recovery, migration,
  Native Host, changelog, and third-party notices are present.
- [x] Extension and locally built Native Host packages have SHA-256 checksums.

## Manual product gate

- [ ] Load the final unpacked `dist/` in a clean Chrome profile.
- [ ] Open a public arXiv PDF, a normal HTTPS PDF, a local PDF, and a scanned PDF.
- [ ] Confirm Reader canvas is nonblank and text, annotations, and controls do
  not overlap at desktop and 360–440 px widths in light and dark themes.
- [ ] Confirm all six annotation types survive reload and exported PDF output is
  visible in Chrome Preview and Adobe Reader.
- [ ] Import and export representative BibTeX and RIS libraries.
- [ ] Exercise a 10,000-paper fixture on the release target hardware and attach
  startup, warm-search p95, and scrolling measurements.

## Google Drive gate

- [ ] Configure a production Chrome Extension OAuth client for the final fixed
  extension ID.
- [ ] Build with `PAPERFLOW_GOOGLE_OAUTH_CLIENT_ID` and `--mode release`.
- [ ] Verify the consent screen and requested scope show only `drive.file`.
- [ ] Complete the documented two-profile/two-device synchronization scenario
  with a real Google account.
- [ ] Interrupt and resume a large encrypted PDF upload.
- [ ] Test concurrent note conflicts, password change, recovery-key unlock, and
  a stale Drive Changes cursor.
- [ ] Inspect Drive and confirm filenames and object bodies expose no paper
  metadata or plaintext.

## Native Host distribution gate

- [ ] Build each package on native macOS, Windows, and Linux runners.
- [ ] Verify install, status, credential store, Codex call, and uninstall on
  each supported OS.
- [ ] Sign and notarize the macOS binary with Apple Developer ID.
- [ ] Authenticode-sign the Windows binary.
- [ ] Apply the chosen Linux package-signing policy.
- [ ] Publish checksums over the exact signed packages.

Unsigned CI and local builds must be labeled development artifacts.

## Chrome Web Store gate

- [ ] Confirm the checked-in manifest key maps to the production store ID.
- [ ] Host `docs/privacy.md` at a stable public privacy-policy URL.
- [ ] Prepare screenshots, listing copy, support URL, and data-use disclosures.
- [ ] Upload the OAuth-enabled audited ZIP.
- [ ] Complete Chrome Web Store review and record the approved version.

## Commands

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm audit:release
pnpm test:e2e
pnpm package

cargo fmt --manifest-path native-host/Cargo.toml -- --check
cargo test --locked --manifest-path native-host/Cargo.toml
cargo clippy --all-targets --locked --manifest-path native-host/Cargo.toml -- -D warnings
cargo build --release --locked --manifest-path native-host/Cargo.toml
```

Release builds additionally require:

```bash
PAPERFLOW_GOOGLE_OAUTH_CLIENT_ID="<production client id>" \
  pnpm package:release
```

`package:release` rejects missing or malformed Google OAuth client IDs, audits
the resulting extension, and writes `paperflow-ai-release.zip` with its SHA-256
file. Never publish the credential-free `paperflow-ai.zip` as a Google Drive
enabled build.
