# Encrypted Vault Recovery

## What is required

Access to the Google account is necessary but not sufficient. To decrypt a
PaperFlow vault, a device also needs one of:

- the independent vault password;
- the recovery key shown once when the vault is created;
- a previously saved device key in the operating-system credential store.

PaperFlow, Google, and the AI provider do not have a recovery bypass. If all
three are unavailable, the encrypted Drive data cannot be recovered.

## New computer

1. Install the same or a newer compatible PaperFlow version.
2. Connect the same Google account in **Settings > Encrypted Google Drive vault**.
3. When PaperFlow finds `PaperFlow/vault.json`, choose password or recovery key.
4. Optionally enable **Remember this device**. This requires the Rust Native
   Host and stores only the VMK in Keychain, Credential Manager, or Secret
   Service.
5. Keep Chrome open until the first sync finishes. PDFs are downloaded lazily
   when opened unless the local offline policy requests them.

## Recovery key handling

The key is a random 256-bit value encoded for human storage and shown only
during vault creation. Store it in a password manager or another protected
offline location. Do not place it in a paper note, browser sync, source control,
or the same Google Drive folder.

Unlocking with the recovery key does not rotate it. To regain password access,
unlock with the recovery key and set a new vault password. Password changes
rewrap the VMK; they do not re-encrypt every historical object.

## Lost or replaced device

Use **Forget device** before disposal when possible. This removes the remembered
VMK from that operating-system account but does not delete the Drive vault.
Disconnecting Google only removes Chrome's cached authorization and locks the
current session.

If a device was lost while unlocked:

1. Revoke PaperFlow's Google authorization from the Google account.
2. Change the vault password from a trusted device.
3. Remove the old OS account or credential-store entry when remote device
   management permits.

Changing the password does not invalidate an already remembered VMK. Device
revocation therefore depends on controlling or wiping the lost OS account.
PaperFlow v1 has no server-side device registry.

## Damaged cloud objects

AES-GCM authentication failures stop object application. Keep a local export
and any original PDFs until recovery is complete. If a valid local PDF remains,
remove the damaged remote object and allow PaperFlow to upload it again. Do not
edit `vault.json` or encrypted `.pfo` files manually.

## Local database recovery

If IndexedDB migration or version opening fails, Side Panel, Reader, and Library
redirect to `recovery.html`. The page is read-only and can export every
accessible IndexedDB store as `paperflow-recovery-<timestamp>.json`.

The export intentionally excludes:

- OPFS PDF and encrypted-upload binary files;
- OAuth tokens managed by Chrome;
- API keys and remembered vault keys held by the OS credential store;
- Codex credentials.

Before reinstalling or clearing site data, preserve the recovery JSON and
original PDFs. Reinstalling an older extension over a newer database is not a
supported downgrade path.
