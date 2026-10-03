# Protected cloud storage

This Node.js 22 / Azure Functions v4 API replaces the old overwrite-only proxy.
It has not been deployed by the repository changes. Keep cloud sync disabled
until the following configuration and checks are complete.

## Build and deploy

From the repository root:

```powershell
npm ci --prefix api
npm --prefix api test
npm --prefix api run build
```

Deploy the **api directory including its dist output and production dependencies**
to a Node.js 22 Azure Function App using your approved deployment process.
`dist` contains both the handler and the shared snapshot validator compiled from
the frontend source. Keep the default `/api` Functions route prefix.

This implementation uses `DefaultAzureCredential`, not account keys in the
browser. Enable a managed identity on the Function App and assign **Storage Blob
Data Contributor** scoped to a private, pre-created blob container. Enable blob
versioning and soft delete on the storage account as independent protection.
Do not enable public blob access.

Configure server-side application settings:

| Setting | Value |
| --- | --- |
| `FUNCTIONS_WORKER_RUNTIME` | `node` |
| `STORAGE_ACCOUNT_URL` | `https://<account>.blob.core.windows.net` |
| `STORAGE_CONTAINER` | Private container name |
| `STORAGE_AUTH_MODE` | `swa-linked`, only after linking and verifying platform authentication |
| `STORAGE_IMPORT_LEGACY` | `true` for an existing container with `<SWA-userId>-money-save` blobs; otherwise `false` |

Configure Functions host storage separately, preferably with identity-based host
storage settings. Do not commit local.settings.json, credentials, or real financial
data.

## Authentication and rollout requirements

1. Export existing local data and take an independent copy of existing cloud blobs.
2. Upgrade to **Static Web Apps Standard** if using the existing Free plan. This
   architecture uses a linked Function App because managed Functions do not
   support managed identity. Review the additional Azure costs before provisioning.
3. Link the Function App through Static Web Apps > APIs. Leave `api_location: ""`
   in the existing frontend workflow; deploy this Function App separately.
4. Keep the **Azure Static Web Apps (Linked)** platform authentication provider
   enabled and require authentication. Do not permit anonymous direct traffic to
   the Function App. The handler trusts the platform-injected
   `x-ms-client-principal` header; it is NOT safe to expose this handler as an
   unprotected anonymous HTTP endpoint. Verify a direct request, including a
   forged principal header, is rejected by the platform.
5. Preserve the original SWA identity provider and user IDs for migration. The API
   derives its storage namespace from the authenticated provider/user ID, never a
   user-selected blob name. There is no shared development or anonymous user.
6. Disable writes on the old storage proxy and stop old clients before migration.
   Otherwise old clients can still damage their old legacy blob, outside this
   API's protection. Old blobs are read-only migration inputs and are never changed
   here. A valid legacy save is copied into a retained revision before a new client
   can save. Corrupt/null legacy saves block migration instead of becoming empty.
7. Set frontend build settings `REACT_APP_SKIP_AUTH=false` and
   `REACT_APP_CLOUD_SYNC_ENABLED=true` only after the backend is ready. Restart or
   rebuild to apply changes. The browser uses the same-origin `/api/storage`
   endpoint; no SAS/account keys or cross-origin proxy fallbacks are used.

SWA permits only one linked backend; preserve any other `/api` functions when
integrating this API with an existing backend. Linked backends do not work in SWA
pull-request preview environments. This repository's AI requests use their
separately configured OpenAI proxy.

## Protocol and recovery

All responses carry `X-MoMoney-Storage: 1` and `Cache-Control: no-store`.

* `GET /api/storage/current`: `{ account, current: null | version }`.
  `null` is returned only for an absent save, not failed reads.
* `PUT /api/storage/current`: `{ expectedRevision, data, allowRemoval }`.
  `expectedRevision: null` creates a first save; an existing save requires its
  exact revision. A missing base is rejected. Removal of any persisted record ID
  requires `allowRemoval: true` after a client confirmation.
* `GET /api/storage/versions?cursor=<revision>`: 25 committed version metadata
  records and an optional `next` cursor.
* `GET /api/storage/version?revision=<revision>`: one complete recovery snapshot,
  restricted to the signed-in user's namespace.

Snapshots are created with `If-None-Match: *` under unique IDs. The small head
pointer is updated using `If-Match` or create-only conditions, so only one
concurrent writer can advance the head. A losing writer gets 409, never an
unconditional retry. No endpoint deletes a version. A failed head update can
leave an unreferenced snapshot, but cannot damage the current one; these
unreferenced candidates are available to an administrator, not listed as
committed versions.

Versions are retained indefinitely. Monitor growth and costs. Do not apply a
generic lifecycle deletion rule to this container: the version chain requires
its ancestors for recovery history. Azure administrators still have the power to
delete data; this is application-level create-only history, not a storage
immutability policy or a substitute for independent backups. Snapshots over
10 MB are rejected explicitly. Configure an equivalent request body limit at
the platform/gateway to avoid buffering oversized requests.

Before enabling production writes, use disposable data to confirm:

* unauthenticated and forged-header requests fail, and two users are isolated;
* a first upload/download survives reload on a second device;
* two writers using one revision produce one success and one conflict;
* an empty save is blocked, and an explicitly approved empty save can be recovered;
* a network/storage failure leaves the last acknowledged revision unchanged;
* an existing legacy save migrates without being modified.

## References

* [HTTP Functions Node.js programming model](https://learn.microsoft.com/azure/azure-functions/functions-reference-node)
* [Blob optimistic concurrency and ETags](https://learn.microsoft.com/azure/storage/blobs/concurrency-manage)
* [Linking a Function App and its authentication constraints](https://learn.microsoft.com/azure/static-web-apps/functions-bring-your-own)
* [Managed versus linked API capabilities](https://learn.microsoft.com/azure/static-web-apps/apis-functions)
* [Blob versioning](https://learn.microsoft.com/azure/storage/blobs/versioning-overview)
