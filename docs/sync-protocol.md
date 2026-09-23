# PaperFlow Sync Protocol v1

## Scope

Protocol version `1` synchronizes one personal PaperFlow library through the
user's Google Drive. It covers saved papers, aliases, collections, tags,
documents, notes, annotations, conversations, paper memory, selections,
reading state, and an allowlist of non-sensitive settings. Temporary workspaces,
search indexes, OCR caches, OAuth tokens, API keys, and plaintext vault keys are
not synchronized. PDF bytes are synchronized only when the device-local
**Back up offline PDFs** setting is explicitly enabled; it is off by default.

The implementation constants and runtime schemas are in
`src/sync/protocol.ts`. Every downloaded header, encrypted object, batch, and
snapshot is validated before it is used.

## Drive layout

PaperFlow requests only `https://www.googleapis.com/auth/drive.file` and creates
a visible folder named `PaperFlow`.

| Object | Visibility | Purpose |
|---|---|---|
| `vault.json` | Readable protocol header | Vault UUID, KDF parameters, and two encrypted VMK wrappers |
| Opaque `.pfo` objects | AES-256-GCM ciphertext | Operation batches, snapshots, and PDFs |

Opaque names are HMAC-derived. Drive metadata for batches and snapshots contains
only the vault UUID, object class, and random batch or snapshot UUID. Paper
titles, authors, DOI values, note text, logical paper IDs, and PDF filenames are
never used as Drive filenames or metadata.

## Encryption envelope

Each business object has a random 256-bit object key. The plaintext is split
into authenticated chunks. Each chunk uses AES-256-GCM with a unique 96-bit
nonce. Additional authenticated data binds:

```text
vault format + protocol version + vault UUID + object type + logical ID + chunk index
```

The object key is wrapped by a domain-separated key derived from the Vault
Master Key (VMK). A separate domain-derived HMAC key creates the opaque Drive
name. Authentication failure aborts the entire object; partial plaintext is not
applied.

## Operation log

Every synchronized local mutation writes its entity and an operation in one
Dexie transaction. An operation contains:

- globally stable operation ID;
- device UUID and monotonically increasing sequence;
- entity type and entity ID;
- `put` or `delete`;
- Lamport version `{ counter, deviceId }`;
- optional base version and validated payload;
- creation time and local upload state.

After a five-second debounce, at most 250 ready operations are assigned a random
batch UUID. A batch is immutable. Retrying the upload reuses the same opaque
name, and replaying an operation is idempotent.

When PDF backup is enabled, document metadata is not batched until its encrypted
PDF object is available. PDF payloads use Drive resumable upload. OPFS retains
the encrypted temporary payload; IndexedDB retains only the session URL,
confirmed offset, total size, and current chunk hash. Disabling PDF backup
cancels pending local upload state without affecting notes or other library
records.

## Pull and bootstrap

A new device lists PaperFlow-created objects, applies the latest snapshot, then
replays batches in creation order. An established device uses a persisted Drive
Changes cursor. HTTP `410` invalidates the cursor and triggers a complete
PaperFlow-folder rescan.

Snapshots are immutable and generated at most once per 24 hours when the
service-worker time budget permits. They contain the latest versioned entity
records and applied operation IDs, but no search index or cache.

## Merge rules

- Lamport tuples are ordered by counter, then device UUID for deterministic ties.
- Independent relation rows, tags, collections, annotations, and messages merge
  independently.
- Paper reading fields use field-level versions.
- Trusted non-empty identity metadata is not replaced by an empty value.
- Deletes are tombstones and prevent an older device from resurrecting a record.
- Concurrent edits to one note preserve the losing content as a deterministic
  conflict copy and add an item to the conflict center.

## MV3 scheduling and retry

Synchronization runs on startup, network recovery, explicit user request,
queued-change alarms, and a 15-minute periodic alarm. A run uses a 20-second
soft budget and checkpoints each stage.

- `401`: clear the cached Chrome Identity token and require reconnection.
- `403`: pause, preserving the local queue.
- `429`: honor `Retry-After` or use capped full-jitter exponential backoff.
- offline: keep all local changes pending.
- missing remote PDF: mark the document recoverable and allow re-upload.

## Compatibility

All protocol objects contain `version: 1`. Runtime schemas accept exactly the
current version. A client receiving a newer unknown version stops before
decrypting or applying it; it must not overwrite the vault. Database schemas are
separate from the cloud protocol and are never automatically downgraded.
