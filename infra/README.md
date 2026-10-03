# Protected storage rollout

`main.bicep` provisions a new Canada Central resource group, FC1 Function App,
keyless StorageV2 account, managed identity, and monitoring. It does not recreate
the existing Static Web App or modify/delete legacy financial blobs.

The new app is initially locked: platform authentication is required and
`STORAGE_AUTH_MODE=disabled`. After linking the existing `Momoney` Static Web App,
verify direct unauthenticated and forged-header requests are rejected by the
platform before setting `STORAGE_AUTH_MODE=swa-linked`.

The template grants the deploying user read-only access to the old `money-files`
container and contributor access to the new account for migration and deployment.
The application identity has no access to the old account.

Deployment order:

1. Resolve the unregistered Microsoft.Quota provider and verify Canada Central
   Flex capacity. Validate/preview Bicep before provisioning.
2. Deploy `main.bicep` at subscription scope with `main.parameters.json`.
3. Package the API with `package-api.ps1 -Destination <new-local-zip-path>`.
   The ZIP includes the shared compiled validator and dependencies, but no local
   settings or credentials.
4. Deploy the ZIP to the new Function App. Link the existing Standard Static Web
   App to it and verify platform authentication while data access remains disabled.
5. Record the previous `AzureWebJobs.blobProxy.Disabled` setting on `StorageProxy`
   in `StorageProxy_group`, then set it to `true`. Verify the legacy blob endpoint
   is inaccessible. Do not stop the whole Function App: it also hosts OpenAI APIs.
6. Run `node infra\migrate-storage.cjs --confirm-frozen` using an authenticated
   Azure CLI account after RBAC propagation. It copies all legacy blobs
   create-only, compares SHA-256 contents, and verifies source ETags remain
   unchanged. It does not print financial data or overwrite conflicting files.
7. Enable `STORAGE_AUTH_MODE=swa-linked`. Publish the frontend with
   `REACT_APP_SKIP_AUTH=false` and `REACT_APP_CLOUD_SYNC_ENABLED=true`.
8. Verify signed-in access, data recovery, conditional conflicts, and rejected
   anonymous requests. Keep old blobs intact. Never reopen legacy writes after
   the new API has accepted writes without explicitly reconciling both copies.

If rollout fails before enabling new API writes, keep all copied data and restore
the recorded legacy disabled setting only after confirming the new API remains
disabled. Do not use resource-group deletion as failure recovery.

Reapplying Bicep resets the API to its safe disabled state and resets platform
authentication configuration; reverify/relink before enabling data access again.
This is a controlled rollout template, not an unattended periodic reconciliation.

References: [managed-identity Flex template](https://learn.microsoft.com/azure/azure-functions/functions-create-first-function-bicep),
[Flex memory options](https://learn.microsoft.com/azure/azure-functions/flex-consumption-plan),
[linked backend authentication](https://learn.microsoft.com/azure/static-web-apps/functions-bring-your-own).
