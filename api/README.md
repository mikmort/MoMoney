# Protected cloud storage and AI

This Node.js 22 / Azure Functions v4 API replaces the old overwrite-only proxy.
It is deployed as `func-momoney-prod-4eb0` in Canada Central and linked to the
existing Standard `Momoney` Static Web App. The private StorageV2 account is
`stmomoneyprod4eb0`; access uses managed identity. See `infra/README.md` for the
controlled deployment procedure.

On October 3, 2026, all six legacy save blobs were copied create-only and
SHA-256 verified, with the original account left intact. Five passed snapshot
validation; one already had `transactions: null` in the source. That incomplete
save is preserved and blocked from automatic migration, not treated as an empty
account. It requires a known-good backup/local export for deliberate recovery.
The legacy `StorageProxy/blobProxy` function is disabled; other functions were
not replaced.

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
pull-request preview environments. This repository's AI requests also use this authenticated linked backend.

## AI chat completions

The combined API was deployed to `func-momoney-prod-4eb0` on October 3, 2026,
using the existing `mikmortazureopenai` account in East US and a new
`gpt-5.4-mini` deployment (`2026-03-17`, GlobalStandard, 10,000 TPM).
Global processing was explicitly approved. The Function App identity has the
resource-scoped inference role; existing storage settings and data were preserved.
Frontend rollout is tracked in `.azure/deployment-plan.md` and the existing
GitHub Actions workflow; signed-in end-to-end verification is a release check.

`POST /api/openai/chat/completions` accepts `{ deployment, messages,
max_completion_tokens }` and returns `{ success: true, data }`, where `data` is
the chat completion including the actual model and token usage. Errors are
non-2xx `{ success: false, error }`. The old `max_tokens` field is accepted during
rollout, but only `max_completion_tokens` is sent upstream.

Configure `AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com/` and
`AZURE_OPENAI_DEPLOYMENT=gpt-5.4-mini` on the Function App. Grant its existing
managed identity **Cognitive Services OpenAI User** scoped to that OpenAI
resource. Keep `AZURE_CLIENT_ID` for the user-assigned identity. Do not add API
keys to frontend settings. The backend uses the GA `/openai/v1/chat/completions`
API with Entra authentication; there is no dated preview API version.

AI requires the same verified SWA-linked platform authentication and
`STORAGE_AUTH_MODE=swa-linked` as storage. This gate does not require a storage
read or write for inference. Never expose an unprotected endpoint trusting
caller-supplied identity headers.

### Model selection and costs

GPT-5.4 mini is the default for categorization, statement/schema extraction,
account identification, and anomaly detection. It is a more balanced choice
for this mixed workload than a flagship model, while nano deserves a separate
accuracy evaluation before using it for ambiguous financial records.

Published OpenAI reference prices in USD per million text tokens (October 3,
2026; Azure region/SKU/contract pricing can differ):

| Model | Input | Output | Fit |
| --- | ---: | ---: | --- |
| GPT-5.4 nano | $0.20 | $1.25 | Lowest cost; evaluate on labeled financial examples first |
| GPT-5.4 mini | $0.75 | $4.50 | Recommended mixed-workload starting point |
| GPT-5.4 | $2.50 | $15.00 | More expensive; no demonstrated need for this app yet |

At 1,000 input + 200 output tokens per request, mini costs about $0.00165
($1.65 per 1,000 requests), before Azure-specific pricing, retries, and hosting.
This is an estimate, not a measured import cost or an accuracy benchmark.
Existing rules and transaction batching still avoid unnecessary inference.

The server fixes `reasoning_effort=none`, strips sampling parameters, disables
stored responses, limits requests to 256 KB / 100 messages, and caps generated
tokens at 16,000. Reasoning is disabled to preserve the small visible-output
budgets and avoid hidden reasoning charges. Clients cannot request additional
choices, tools, arbitrary deployments, or expensive reasoning. Truncated,
filtered, refused, and empty completions are errors, never successful data.
Only transient client failures are retried; no automatic model escalation or
persisted fallback deployment can silently alter the cost/quality choice.

Deploy the API and configure/verify the model before publishing the frontend
with `REACT_APP_AI_ENABLED=true`. Keep it false in PR previews (linked APIs are
unavailable there). Set `REACT_APP_AZURE_OPENAI_DEPLOYMENT` to the server's
deployment name if you use an alias. Settings shows the configured deployment
until a request succeeds, then the returned model version.

Do not reapply `infra/main.bicep` just to change AI configuration: it resets
storage authentication to its locked rollout state. Update only the two AI app
settings, add the narrowly scoped role, and deploy the combined API package,
preserving the existing storage functions/settings and platform authentication.
Keep legacy OpenAI deployments/functions intact until the new frontend rollout
is verified. Rate limits are throughput limits, not spending caps; monitor
Azure token usage and configure a budget alert.

References: [model pricing and capabilities](https://developers.openai.com/api/docs/models/gpt-5.4-mini),
[Azure pricing](https://azure.microsoft.com/pricing/details/azure-openai/),
[reasoning parameters](https://learn.microsoft.com/azure/ai-foundry/openai/how-to/reasoning),
[Azure v1 API](https://learn.microsoft.com/azure/ai-foundry/openai/api-version-lifecycle).

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
