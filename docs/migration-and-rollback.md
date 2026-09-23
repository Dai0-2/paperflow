# Migration and Rollback

## Upgrade from v0.7.0

PaperFlow v1.0 opens the existing `paperflow-ai` IndexedDB database and applies
ordered Dexie schema migrations. The v1-to-v2 upgrade first copies all legacy
stores into `migrationBackups/v1-pre-upgrade` within the same IndexedDB upgrade
transaction. It then adds local-library fields and version metadata. If any
step fails, IndexedDB aborts the transaction and retains the old schema.

Later schema versions add synchronization recovery stores and the migration
backup index. The backup is marked with `completedAt` only after a subsequent
application startup opens the final schema successfully. It is not
automatically deleted in v1.0.

Legacy `paperflow:messages:*` and `paperflow:notes:*` local-storage records are
copied into IndexedDB once per paper. Source values remain untouched when the
copy fails and are not destructively removed by migration.

Before upgrading:

1. Keep a copy of the v0.7.0 extension package.
2. Export important notes and retain original PDFs.
3. Do not clear extension storage during the upgrade.
4. Reload the extension once and open Library before removing the old package.

## Recovery mode

If a database cannot be opened, normal application surfaces stop before
rendering and redirect to `recovery.html`. Use **Export recovery data** before
changing extension storage. The JSON contains all readable IndexedDB stores,
including `migrationBackups` when available.

The recovery export does not contain OPFS PDF bytes or credentials. Preserve
the original PDF files separately.

## Rollback policy

PaperFlow does not downgrade IndexedDB schemas. Installing v0.7.0 over a profile
that has opened v1.0 may produce a database `VersionError` or cause the old code
to misinterpret records.

Supported rollback choices are:

1. Restore a complete browser-profile backup made before upgrading.
2. Install v0.7.0 in a separate Chrome profile and manually re-import compatible
   notes or papers.
3. Keep v1.0 installed, use recovery mode to export data, and wait for a fixed
   forward version.

Never delete the `PaperFlow` Google Drive folder as a rollback step. Cloud
protocol version 1 rejects unknown newer versions and does not allow an older
client to overwrite them.

## Fresh installation

A fresh profile creates the latest schema directly and has no `v1-pre-upgrade`
backup because there is no legacy data. To recover an existing library, connect
the same Google account. A legacy password/recovery header requires one
successful unlock before PaperFlow upgrades it to account-managed sync.
