# Optimized AI re-run and CSV parsing rollout

Status: Validated

## Current release: October 4, 2026 (frontend optimization)

User requested deployment of the optimized re-run path and investigation of an
incorrect imported CSV row. Recipe: CI/CD frontend-only release through the
existing Static Web Apps workflow after green PR checks and merge to main.
Target remains `Momoney`, `Momoney_group-8b40`, subscription
`8cf05593-3360-4741-b3e8-ccc6f4f61290`, public hostname
`gentle-moss-087d9321e.1.azurestaticapps.net`.

No backend handler, API contract, model, quota, identity, RBAC, authentication,
infrastructure or stored financial-data change is required. The deployed
backend already provides the retry headers and error codes used by this client.
Do not redeploy the backend or run the storage provisioning/migration.

Changes: quota-aware bounded concurrency, adaptive classification batches,
compact catalog tuples retaining all semantic hints, guarded batched saves,
processing/wait/saving progress, local CSV header mapping and complete-value
amount validation. Unknown CSV schemas fail explicitly when AI cannot map them.
The deployment workflow isolates push and PR concurrency groups so PR cleanup
cannot cancel a production release.

### Current validation steps

- All validation checks pass:
  - Core: production frontend build with authentication/AI/cloud enabled,
    full frontend tests, TypeScript, production-source lint, shared API tests.
  - Docker: not applicable; static web frontend build.
  - Infrastructure validate/what-if/policy changes: not applicable; no resources,
    regions, SKUs, networks, settings or roles are being changed.
  - Role verification: existing workflow uses its existing deployment credential;
    no role additions. Preserve the linked backend and its authentication.
  - GitHub PR checks and production deployment must succeed.
  - Verify published JS contains optimized progress and CSV safeguards.

### Rollback

Revert the frontend change through a PR and let the existing main workflow
redeploy. Do not modify financial records to roll back application code.
Incorrect historical rows require a deliberate correction against source data;
this release does not attempt a data migration.

## Historical release: October 4, 2026 (backend recovery)

User approved repairing CI/tests, merging after checks, and deploying both
frontend and backend. Subscription and existing Function App were explicitly
confirmed. Backend recipe: AZCLI code-only ZIP deployment. Frontend recipe:
existing CI/CD on merge to main. Do not reprovision infrastructure, change
app settings/identity/model, or access financial save blobs.

Targets: `func-momoney-prod-4eb0` in `rg-momoney-prod-4eb0`, Canada Central,
subscription `8cf05593-3360-4741-b3e8-ccc6f4f61290`; existing Momoney Static Web App.
Retain the current deployment ZIP from the dedicated `deployment` container
before publishing a replacement. Preserve storage and OpenAI routes and their
platform authentication.

Current changes: meaningful category catalogs, merchant-first classification,
confirmed AI rules, paced retries with explicit errors, filtered Re-run AI,
CI fixture repair, a local-month label correction, and standalone API packaging.
Two redundant test files were removed: one asserted hard-coded Spotify responses;
the other sorted its mock grid itself and had no-op sort/selection handlers.
Meaningful catalog, service, UI, import and financial tests are retained.

### Current validation proof

- All validation checks pass:
  - Core validation: authenticated Azure CLI; existing target Running on Node 22;
    production frontend build with auth/AI/cloud enabled; TypeScript and
    production-source lint pass; full retained suite 129 suites / 662 tests;
    API build and 24 tests pass.
  - Template validation/what-if: not applicable to this code-only update; the
    existing storage provisioning template must not be reapplied.
  - Docker build: not applicable to Node ZIP deployment.
  - Azure policy: confirm existing-resource code-only deployment; no region,
    SKU, network, resource or RBAC changes.
  - Package inspection, rollback retention, platform auth verification and
    live role checks pass.
  - GitHub PR quality checks and preview deployment pass for `15d44c3`.

Local validation completed October 4, 2026: `npx tsc --noEmit`,
React Scripts full Jest suite with Windows-compatible testMatch overrides,
production-source ESLint, `npm --prefix api test`, and production `npm run build`.
The live application identity retains its scoped Cognitive Services OpenAI User
and storage roles. Interactive-user inference access remains unavailable and is
not being broadened.

## Historical GPT model upgrade rollout (October 3)

The following sections record the preceding deployment, not the scope of this update.

## 1. Scope

MODIFY the existing Node.js 22 Functions v4 backend; do not reprovision storage
infrastructure. User approved backend deployment and this rollout record.
On October 3, 2026, the user approved committing the upgrade, incorporating the
latest main-branch backup-picker fix, creating a PR, and merging after checks pass
to release the frontend. No backend redeployment or data migration is planned.

## 2. Azure context

- Subscription: Visual Studio Enterprise Subscription
  (`8cf05593-3360-4741-b3e8-ccc6f4f61290`).
- Function App: `func-momoney-prod-4eb0`, `rg-momoney-prod-4eb0`, Canada Central.
- Existing identity: `id-momoney-prod-4eb0`.
- OpenAI: `mikmortazureopenai`, `rg-mikmort-8547_ai`, East US.
- Model: `gpt-5.4-mini`, version `2026-03-17`, GlobalStandard capacity 10.
  Provisioned successfully on October 3, 2026 with explicit user approval for
  global processing. Other model deployments remain unchanged.

## 3. Recipe and architecture

Current recipe: CI/CD (`recipe.type: cicd`). Release the frontend through
`.github/workflows/azure-static-web-apps-gentle-moss-087d9321e.yml` on merge to
main. Keep `api_location` empty and the existing linked backend unchanged.
The already-completed backend release used AZCLI, not azd or the storage Bicep.

Browser -> authenticated SWA-linked API -> Entra managed identity -> Azure
OpenAI v1 Chat Completions. AI route and storage route coexist in the same app.
Keep SWA provider, linked backend, storage settings, and saved blobs unchanged.

## 4. Changes

1. Add server-validated AI route with fixed model/reasoning and bounded output.
2. Add Cognitive Services OpenAI User scoped only to the existing OpenAI resource.
3. Set only AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_DEPLOYMENT on the Function App.
4. Package/deploy the API, preserving both handlers and their shared dependencies.
5. Verify model inference with synthetic data, endpoint authentication, and
   storage-route registration without reading or modifying financial records.

## 5. Cost and safeguards

Pay-per-token, no provisioned-throughput reservation. Published reference mini
prices: $0.75/M input and $4.50/M output tokens; actual Azure billing may differ.
Reasoning disabled; no automatic model escalation; maximum 16,000 completion
tokens/request and 256 KB request bodies. Throughput quota is not a spending cap.
No secrets in browser configuration, logs, or source.

## 6. Rollback

Keep previous backend deployment package available. If the new handler fails,
do not publish the frontend; restore the previous package if storage availability
is affected. Never rerun the storage provisioning/migration or delete blobs.
Existing frontend continues to use its legacy AI proxy until release.
For a frontend rollback, revert the frontend release commit through a PR and
let the existing workflow redeploy main; do not revert or migrate stored data.

## 7. Validation proof

### Optimization and CSV release: October 4, 2026

- Full frontend React Scripts Jest suite with Windows-compatible testMatch:
  132 suites / 687 tests passing.
- `npx tsc --noEmit --pretty false`: passes.
- Production-source ESLint: passes.
- `npm run build` with `CI=true`, `REACT_APP_SKIP_AUTH=false`,
  `REACT_APP_AI_ENABLED=true`, `REACT_APP_CLOUD_SYNC_ENABLED=true`,
  `GENERATE_SOURCEMAP=false`: passes.
- `npm --prefix api test`: 24 tests pass. Diff against current production
  confirms no backend handler or infrastructure changes.
- Existing CI quality gates pass on `d4c24f0`: full tests/lint, TypeScript and
  API checks. Preview and final production release remain monitored gates.
- Synthetic parser regressions cover posting-date/description confusion,
  numeric merchant prefixes, signed amounts, reordered headers, split debit/
  credit fields, and unavailable schema AI.
- Local-only source validation: 180 CSV rows, 180 valid monetary values, zero
  date-like descriptions. No private source data is included in test fixtures.
- Prior local optimization browser check: 37 synthetic rows classified using
  two mocked calls; quota countdown shown; all 36 newly seeded rows retained
  original history and AI metadata. No real inference or financial edits.
- Remote main at `b916039` exactly matches the previously verified release
  snapshot. It was merged into this follow-up without changing the tested tree.
- Backend deployment is unnecessary; its code and production settings are
  unchanged by this release.

### Recovery release: October 4, 2026

- `npx tsc --noEmit --pretty false`: passes across production and tests.
- Full React Scripts Jest suite: 129 suites / 662 tests pass. The separate
  America/Los_Angeles date-boundary selection passes 15 tests.
- Production-source ESLint with the CI warning threshold: passes.
- `npm run build` with `CI=true`, `REACT_APP_SKIP_AUTH=false`,
  `REACT_APP_AI_ENABLED=true`, `REACT_APP_CLOUD_SYNC_ENABLED=true` and
  `GENERATE_SOURCEMAP=false`: passes.
- `npm --prefix api test`: 24 tests pass, including retry delays, error codes,
  authentication, payload bounds and storage regression checks.
- GitHub Quality Checks for `15d44c3`: frontend lint/full tests, TypeScript,
  and API build/tests pass. PR preview deployment `37192656682` also passes.
- Azure REST confirms the existing Function App is Running, Node 22, with its
  original user-assigned identity and blob-based deployment container.
- Platform authentication: enabled, authentication required, linked SWA provider
  enabled. Storage remains `swa-linked`; endpoint/model/client identity and
  container settings are unchanged.
- Live RBAC confirms the original scoped OpenAI inference role and storage
  roles. No role or infrastructure change is included in the deployment.
- Subscription-scope policy assignment query returned no assignments. This
  code-only release changes no regions, SKUs, networking or resources.
- `infra/package-api.ps1` produced the standalone API ZIP. Archive inspection
  confirms both function handlers and shared modules, with no `.env`,
  `local.settings.json`, `.git` or frontend dependency link.
- Rollback package copied read-only from `deployment/released-package.zip`,
  SHA-256 `CDAA5D909BCA6F10A966E65A7618581DC7103202766619B2F825A1040F3F8FCE`.
- New package SHA-256:
  `39823F543538CA89062CA328AE4E604DC88CEEC03E6FB3D721621049E6128D6B`.
  Both archives remain in session artifacts, outside the repository.
- Storage Bicep validate/what-if and Docker build are not applicable: this is
  an existing Node ZIP application update, not infrastructure provisioning.

### Frontend release gate

Revalidate the integrated release candidate before merging. Production builds
must set REACT_APP_SKIP_AUTH=false, REACT_APP_AI_ENABLED=true, and
REACT_APP_CLOUD_SYNC_ENABLED=true. PR previews keep AI and cloud sync disabled.
Require successful PR checks, then verify the main-branch deployment and public
asset/model configuration. A signed-in Settings connection check remains the
final end-to-end check.

- All frontend release validation checks pass:
  - Existing GitHub Actions deployment credentials and pipeline: latest main
    deployment succeeded; no credential, infrastructure, or RBAC changes.
  - Latest main integrated, including `d691bf8` backup-picker changes.
  - Production build with the release flags above: compiled successfully.
  - AI and backup-picker regression selection: 5 suites, 45 tests passing.
  - Changed/integrated-file ESLint and `git diff --check`: passed.
  - Protected API and OpenAI deployment already live; no API package change.
  - PR CI and the subsequent main deployment are gates enforced during release.

Commands re-run October 3, 2026 for the integrated frontend candidate:
`npm run build` with production flags; React Scripts Jest with the relative
testMatch overrides above and `BackupFilePicker` added to testPathPattern;
ESLint for modified AI/configuration/Settings/backup-picker files.

- All validation checks pass:
  - Core validation: authenticated CLI, existing target/runtime, application build,
    packaged functions and shared modules. No ARM deployment, so template validate/
    what-if are not applicable; the storage rollout template must NOT be applied.
  - Docker build: not applicable (Node.js ZIP deployment).
  - Azure policy: verify existing target and allowed narrowly scoped role/settings
    updates; no new compute/storage, location, SKU, or networking changes.
  - Role assignment verification: OpenAI inference requires Cognitive Services
    OpenAI User for principal `1f7860cc-9bf9-4454-9c7a-57794dd4339f`, scoped only
    to `mikmortazureopenai`; existing storage roles remain unchanged.

Preparation checks on October 3, 2026:
- Production build passes with CI=true.
- Four targeted frontend suites / 30 tests pass. Windows worktree path requires
  a relative testMatch override to avoid Jest's generated absolute glob issue.
- API build and 20 tests pass, including authentication, bounds, GPT-5 request
  normalization, malformed/refused/truncated output, and storage regressions.
- Changed-file lint passes. Full-repository lint reports pre-existing test errors
  (113 errors / 60 warnings); unrelated test files are not part of this rollout.
- Existing backend: Node.js 22, Running, storage function registered.
- SWA linked authentication enabled; anonymous requests require login.
- Existing deployment package retained outside source under session artifacts
  as backend-before-ai.zip (SHA-256
  97F3602747A22EB989EABB0878B2470A1EE62B3179D213AD1FFEE4A001424E7A).
- Model deployment Succeeded; GlobalStandard quota supports approved capacity.
- Interactive Owner has no OpenAI data-plane role, so Entra smoke request returns
  401 PermissionDenied. Production identity will receive the approved scoped
  inference role during deployment; do not change the user's own permissions.

Final validation (October 3, 2026, 21:22 UTC):
- `npm run build` with CI=true and GENERATE_SOURCEMAP=false: compiled successfully
  after the Settings refresh change.
- `npm --prefix api test`: 20/20 passing.
- `node node_modules\react-scripts\bin\react-scripts.js test --watchAll=false
  --runInBand --testMatch '**/__tests__/**/*.test.ts' --testPathPattern
  'azureOpenAIService|settings-model-display|anomalyDetection|piiSanitizationIntegration'`:
  4 suites / 30 tests passing.
- Changed-file ESLint: passed. Full-repository pre-existing lint failures noted above.
- Azure CLI authentication, model state, runtime, existing SWA platform auth,
  ZIP contents, rollback package hash, and role definition checked.
- Policy query: only West Europe restriction; this code-only rollout uses
  existing Canada Central / East US resources.
- Live model smoke evaluation with eight synthetic financial transactions:
  8/8 expected category IDs, model gpt-5.4-mini-2026-03-17, finish_reason=stop,
  176 input / 29 output tokens, zero reasoning tokens. Administrative key used
  only in memory for this check; backend remains keyless.
- Local browser: sample data loaded; Settings sends the new same-origin request,
  shows connection success and returned model version using a mocked AI response.
  This does not claim signed-in production end-to-end verification.
- Backend package contains both storage and openai handlers, shared validator
  and model constants, production dependencies, and no local settings/.env.

## 8. Deployment results

### Recovery backend release: October 4, 2026

- Code-only Flex ZIP deployment succeeded using `az functionapp deployment source
  config-zip --build-remote false`; no infrastructure deployment was performed.
- Function App remains Running on Node 22. Both `openai/chat/completions` and
  `storage/{action}` are registered.
- Downloaded the released package from the dedicated deployment container.
  Azure repacked the ZIP, so the archive checksum differs; all 10,599 file names
  and file-content SHA-256 hashes exactly match the validated local package.
  Released archive SHA-256:
  `4D12DDC8501E14296FF6DB8478B46EA3F52F90F5C19DAC549F6A882EBDC73CAA`.
- Storage mode/container/account, AI endpoint/deployment, identity and live RBAC
  assignments are unchanged.
- Anonymous same-origin AI access redirects to login (302); direct backend
  access is denied (401). No financial records were accessed during verification.
- Signed-in production classification remains a user-session verification;
  no authentication bypass or new interactive-user inference role was used.
- Frontend release follows after this rollout record's PR checks pass and merge.

### Historical release results: October 3, 2026

- Backend ZIP deployment succeeded on October 3, 2026.
- Both `openai` (`openai/chat/completions`) and `storage` (`storage/{action}`)
  are registered on `func-momoney-prod-4eb0`.
- AI endpoint and deployment settings verified live. Storage account/container
  and `STORAGE_AUTH_MODE=swa-linked` preserved.
- Inference role assignment verified live:
  `97804bb4-a12d-437e-a05d-e836db548fa9`, Cognitive Services OpenAI User,
  existing application identity, scoped only to the OpenAI resource.
- Same-origin unauthenticated request returned 401. Direct requests, including a
  forged principal, were rejected by platform authentication (400, no AI handler
  marker); no inference was performed.
- User explicitly deferred signed-in production end-to-end verification until
  frontend release. No production frontend was published and no user save was
  read or modified.
- Final frontend recheck: 4 suites / 32 tests pass, production build passes,
  changed-file lint passes, including feature-flag and full-batch coverage.
- Screenshot and previous/current deployment packages retained in session
  artifacts. Local development server stopped after verification.
