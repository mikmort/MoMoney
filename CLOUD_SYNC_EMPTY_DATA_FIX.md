# Cloud sync data safety

Cloud sync uses the signed-in Azure Static Web Apps `userId`. Development mode
does not contact cloud storage, and missing authentication never falls back to
an anonymous or shared account. The first authenticated sync binds this browser's
existing cache to that account; a different account must use a separate browser
profile or explicitly export and clear the previous account's local data.

## Sync and conflict behavior

- All startup, automatic, and manual sync operations use the same safety checks.
  Startup sync runs inside authentication, before opening editable pages.
  Disabling autosave disables startup sync and the 30-second timer.
- IndexedDB and persisted localStorage collections are read directly, including
  inactive accounts. Storage errors, malformed records, missing cloud collections,
  duplicate IDs, and unknown backup versions stop sync instead of becoming empty
  arrays. Legacy string-valued cloud backups and JSON exports are accepted.
- SHA-256 fingerprints exclude export timestamps and normalize property and record
  ordering. A stored, account-specific baseline identifies local-only changes,
  cloud-only changes, and conflicts. Timestamps never choose a winning copy.
- A fresh browser restores cloud data. Unchanged copies produce no uploads.
  Both sides changing, an unknown baseline, or a previously existing blob
  disappearing pauses automatic sync. Export a local backup before resolving a
  conflict in Settings; this is not an automatic record-merging system.
- Uploads that remove any cloud transaction, history entry, account, category,
  budget, or rule require explicit confirmation through **Upload to Cloud**.
  Equal row counts do not bypass the check: record IDs are compared.
  Automatic downloads that remove local records also pause.
- Before replacement, verified recovery blobs preserve the previous cloud copy
  and the upload candidate, or the local copy before a download. A failed backup
  stops the replacement. Uploads are read back and compared before reporting
  success or advancing the baseline.
- Restores validate every record before clearing anything. Transactions, history,
  and preferences are replaced in one IndexedDB transaction; localStorage changes
  are rolled back on failure. An interrupted-restore marker blocks subsequent
  sync after a browser crash. Use a fresh browser profile for cloud recovery if
  this marker remains.
- Imports or edits during a download cause restoration to abort. Restored pages
  reload before further sync. Transaction saves reject stale in-memory caches and
  roll back if even one record fails, rather than committing a partially empty
  database.

## Required storage-proxy support

The storage proxy is external to this repository. Its deployment is not changed
or verified by these client changes. Safe operation requires:

1. GET responses expose the Azure blob **ETag** header to the browser.
2. Upload routes forward **If-Match** and **If-None-Match** conditions atomically
   to Azure Blob Storage and return HTTP 412 when conditions fail. Merely echoing
   an ETag is not sufficient.
3. CORS allows these conditional request headers and exposes `ETag`.
4. Both read routes use 404 only for a missing blob/unsupported route. Network,
   authentication, server, and parsing errors are not treated as missing data.
5. The proxy authorizes blob access against the authenticated user's identity.
   A client-side account ID in a blob name is not server-side authorization.

Existing blobs without an exposed ETag cannot be replaced by the client. This
deliberately favors keeping data over silently using an unsafe overwrite.
Read-back verification and independent recovery copies provide additional
protection, but cannot substitute for server-enforced conditional writes.

Enable Azure Blob versioning and blob/container soft delete as a separate
operational safeguard. See Microsoft's guidance on
[concurrency](https://learn.microsoft.com/azure/storage/blobs/concurrency-manage)
and [data protection](https://learn.microsoft.com/azure/storage/blobs/data-protection-overview).

## Recovery and scope

The current blob is `<userId>-money-save`. Recovery blobs are stored alongside it
as `<userId>-money-save-recovery-<uuid>`. They are not automatically pruned.
An operator with authorized storage access can download the desired recovery
blob. Its version-1 string-valued format can be restored by copying it to the
account's current blob after preserving the existing head, then using
**Download from Cloud** in a fresh browser profile. Confirm counts and contents
before replacement. Do not set a retention policy until a suitable recovery
window and independent backup policy have been chosen.

Sync covers transactions (including transfer links, splits, and currency metadata),
transaction history, preferences, all accounts, categories, budgets, and rules.
Derived balance histories, exchange-rate caches, and transfer-match summaries
are not authoritative sync state; balances and matches are reconstructed from
transactions/accounts. File attachment metadata is included in transactions,
but this does not upload attachment file contents.

An upload is not proof of roaming until the app reports a verified cloud copy.
Keep a downloaded JSON backup of important imports, especially while resolving
legacy conflicts or updating the proxy. Never clear a browser cache merely
because autosave is enabled.
