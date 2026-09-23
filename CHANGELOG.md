# Changelog

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
