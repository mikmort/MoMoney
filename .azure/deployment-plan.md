# GPT model upgrade rollout

Status: Ready for Validation

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

### Frontend release gate

Revalidate the integrated release candidate before merging. Production builds
must set REACT_APP_SKIP_AUTH=false, REACT_APP_AI_ENABLED=true, and
REACT_APP_CLOUD_SYNC_ENABLED=true. PR previews keep AI and cloud sync disabled.
Require successful PR checks, then verify the main-branch deployment and public
asset/model configuration. A signed-in Settings connection check remains the
final end-to-end check.

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
