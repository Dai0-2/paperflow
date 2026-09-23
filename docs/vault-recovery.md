# Google Drive Sync Recovery

## New computer

1. Install the same or a newer compatible PaperFlow version.
2. Open **Settings > Google Drive sync**.
3. Select **Sign in with Google** and use the same Google account.
4. Keep Chrome open until the first sync finishes.

Library records, notes, annotations, conversations, and reading progress restore
automatically. PDFs restore only when **Back up offline PDFs** was enabled on
the source device; backed-up PDFs are downloaded lazily when opened.

## Security boundary

PaperFlow encrypts business objects before uploading them and uses opaque Drive
filenames. The account-managed encryption key is stored in
`PaperFlow/vault.json` so another device can restore data without a separate
password.

This is not zero-knowledge encryption. Anyone who can access the Google account
and all PaperFlow-created Drive files can restore synchronized content. Protect
the Google account with a strong password, multi-factor authentication, and
appropriate device controls.

## Upgrading legacy encrypted data

Data created by an older PaperFlow version may use a separate password and
recovery key. When PaperFlow detects that header, it asks for either credential
once. A successful unlock replaces only the header with the account-managed
format; the library identifier, encryption key, and historical encrypted
objects do not change.

Do not delete the old Drive folder when migrating. If neither legacy credential
is available, that older encrypted data cannot be recovered.

## Lost or replaced device

1. Remove the device from the Google account.
2. Revoke PaperFlow's Google authorization if the device may still be active.
3. Change the Google account password and review active sessions.

Disconnecting inside PaperFlow disables background synchronization on that
browser profile and clears its cached Google authorization token. It does not
delete local data or the `PaperFlow` Drive folder.

## Damaged cloud objects

AES-GCM authentication failures stop object application. Keep a local export
and original PDFs until recovery is complete. If a valid local PDF remains,
remove the damaged remote object and allow PaperFlow to upload it again. Do not
edit `vault.json` or encrypted `.pfo` files manually.

## Local database recovery

If IndexedDB migration or version opening fails, Side Panel, Reader, and Library
redirect to `recovery.html`. The page is read-only and can export every
accessible IndexedDB store as `paperflow-recovery-<timestamp>.json`.

The export intentionally excludes OPFS PDF and encrypted-upload binary files,
OAuth tokens managed by Chrome, API keys held by the OS credential store, and
Codex credentials.

Before reinstalling or clearing site data, preserve the recovery JSON and
original PDFs. Reinstalling an older extension over a newer database is not a
supported downgrade path.
