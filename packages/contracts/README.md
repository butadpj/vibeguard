# Shared contracts

Start here for API payloads, shared models, statuses, and dummy data. Import types from `@vibeguard/contracts`; import fixtures from `@vibeguard/contracts/examples`.

These contracts describe the agreed first integration shape. The runner implements health, ZIP import, project lookup, and the US5 approval/export/recheck routes listed below. Preparation and baseline routes have concrete customer-tracker Docker adapters through the opt-in demo configuration; live database behavior remains unverified. Local model conversation is not configured yet. Repair now uses a bounded operation with injected isolated agent/verifier/preview adapters; the default server has no qualified repair adapter. Cancellation remains a `501 not_implemented` placeholder. TypeScript types do not validate HTTP input; routes validate input at runtime.

```ts
import type { GetProjectResponse, GetJobResponse } from '@vibeguard/contracts';
import { projectReadyExample } from '@vibeguard/contracts/examples';

const mockProject: GetProjectResponse = projectReadyExample;
```

## Models and statuses

| Definition | Source |
| --- | --- |
| IDs, health, error codes and error envelope | [common.ts](src/models/common.ts) |
| Goal draft, proposed/confirmed revisions, messages | [goal.ts](src/models/goal.ts) |
| Project, app setup, frozen versions, previews | [project.ts](src/models/project.ts) |
| Jobs, lifecycle, progress, operation results, repair attempts | [job.ts](src/models/job.ts) |
| Check verdicts, evidence, version-bound verification | [verification.ts](src/models/verification.ts) |
| Approval and saved export | [release.ts](src/models/release.ts) |

## US1: supported demo setup

Use `setup.status`, `setup.message`, and `setup.issue` to show whether the imported app fits our supported demo and can run. `unsupported` means it does not fit; `incomplete` means preparation hit a blocker. `ready` requires the app and local database running independently of founder-platform services. The preview points to that test copy.

Keep model, inference, and harness diagnostics inside the runner. Report blockers through job errors when they affect an operation. We do not need per-project AI readiness, stack inventories, or compatibility scores for the one-app demo.

`Project` is the dashboard snapshot across all five stories. US1 uses `id`, `name`, `setup`, `originalVersion`, `previews`, and `activeJobId`. Later-story fields stay null or empty until those operations run. Keep version identity for protected checks and exact-version approval.

The importable demo is `fixtures/demo-crud/customer-tracker.zip`, with reviewed source beside it. Start its preparation and protected checks with `docker compose -f compose.yaml -f compose.demo.yaml up --build`. This uses ordinary JavaScript, `supabase-js`, and local Supabase backed by real PostgreSQL. See the [US3/US4 handoff](../../context/us3-us4-backend-handoff.md) for the supported goal and laptop verification still required.

## Operations and implementation status

Request/response aliases live in [operations/api.ts](src/operations/api.ts). Read the matching named exports in [examples/index.ts](src/examples/index.ts) for payloads. Resource IDs in URL segments stay out of JSON bodies. Preparation and cancellation have no request body.

| Endpoint | Types / response | Examples | Runner |
| --- | --- | --- | --- |
| `GET /api/health` | `HealthResponse` | `healthExample` | Implemented |
| `POST /api/projects` | `ImportProjectRequest` → `ImportProjectResponse` | See ZIP upload below; `importedProjectExample` | Implemented |
| `GET /api/projects/:id` | `GetProjectResponse` | `demoScenarios` | Implemented |
| `POST /api/projects/:id/prepare` | `PrepareProjectResponse` | `acceptedJobExample`, `preparingJobExample`, `preparedJobExample` | Demo Docker adapter implemented; live readiness unverified |
| `POST /api/projects/:id/messages` | `SendMessageRequest` → `SendMessageResponse` | `messageRequestExample`, `conversationJobExample` | Route implemented; local conversation adapter pending |
| `POST /api/projects/:id/goal/confirm` | `ConfirmGoalRequest` → `ConfirmGoalResponse` | `confirmGoalRequestExample`, `confirmedGoalExample` | Implemented; requires the current goal revision |
| `POST /api/projects/:id/checks` | `RunChecksRequest` → `RunChecksResponse` | `checksRequestExample`, `baselineJobExample` | Demo protected verifier implemented; live results unverified |
| `POST /api/projects/:id/repairs` | `RepairRequest` → `RepairResponse` | `repairRequestExample`, `repairJobExample`, `unsuccessfulRepairJobExample` | Implemented with adapters; laptop qualification/configuration pending |
| `GET /api/projects/:id/repair-evidence` | `GetRepairEvidenceResponse` | `repairEvidenceExample` | Implemented; latest recorded attempts for current goal |
| `GET /api/projects/:id/diffs/:artifactId` | `GetRepairDiffResponse` | `repairDiffExample` | Implemented; exact checked candidate text changes |
| `GET /api/jobs/:id` | `GetJobResponse` | Job examples, including `interruptedJobExample` | Implemented for in-memory jobs (US5); no restart recovery yet |
| `POST /api/jobs/:id/cancel` | `CancelJobResponse` | `cancelledJobExample` | Scaffolded (501) |
| `POST /api/projects/:id/approvals` | `ApproveFixRequest` → `ApproveFixResponse` | `approveRequestExample`, `approvalExample` | Implemented (US5) on runner-managed storage |
| `POST /api/projects/:id/exports` | `ExportProjectRequest` → `ExportProjectResponse` | `exportRequestExample`, `exportedJobExample` | Implemented (US5) |
| `GET /api/artifacts/:id/download` | ZIP bytes | `exportSavedExample.downloadUrl` | Implemented (US5) |
| `POST /api/projects/:id/rechecks` | `RecheckRequest` → `RecheckResponse` | `recheckRequestExample` | Implemented (US5) |

All write requests must include `X-VibeGuard-Request: 1` and pass the local Host/origin checks.

Long-running operations return `JobAccepted` (`{ jobId }`). Poll the job to get its result. Success responses use the named payload directly. API failures use `ErrorResponse` (`{ error: { code, message, nextStep } }`) with an appropriate non-2xx HTTP status. Cancellation returns the current job; a completed job may finish before cancellation reaches it.

For ZIP import, send multipart form data with `file` and optional `name`. The `Blob` field describes the browser input, not JSON or the runner's parsed upload object:

```ts
const body = new FormData();
body.append('file', selectedZipFile);
body.append('name', 'Task app');
// POST /api/projects with headers: { 'X-VibeGuard-Request': '1' }.
```

## Rules for consumers and agents

- Reuse exported definitions. Add shared model fields and status values here before changing consumers.
- Narrow a job by `operation`, then `status`, to read its result. A successful check job can contain failed checks. A successful repair job can return `no_verified_fix`.
- Treat fixtures as synthetic UI data. They provide no proof of repair capability. Clone fixtures before mutating them in a stateful mock client.
- Treat IDs as opaque. The runner resolves files and environments. `savedLocation` is display text, not an input path.
- The runner must validate goal/version/check references, protected check identity, required CRUD verdicts, and the two-attempt limit. Types alone cannot enforce these runtime rules.
- Keep one active job in memory and reject another start with `409 conflict`. Container restart loses job state; the founder retries. Persist candidate files and evidence separately when those features arrive.
- Update this status table, operation payloads, examples, and affected consumers together. Run `pnpm check` from the repo root.

US5 retained checks: `POST /rechecks` starts a `check` job on a later version using the checks saved with an approval. A check that passed at approval and fails now says so in its `explanation`. The runner reads retained checks from `checks.json` in the check-set folder. Each entry has `id`, `name`, `scope`, `command` (`node`, `python`, or `python3`), `args`, and `timeoutMs`. Exit code 0 is `passed`, 1 is `failed`, and anything else is `could_not_check`. The check reads the folder to test from `VIBEGUARD_TARGET_DIR`. Verification should confirm or replace this format.

Repair requires the original source version, current confirmed goal, ready setup, and a failed baseline with complete integration coverage. New baseline/repair results include `checkSetDigest`, binding protected suite bytes across diagnosis, checks, and approval. Older synthetic examples omit this optional field; they are not repair qualification evidence. Repairs require a digest-bound baseline, so rerun old baselines before repair. `Job.repairAttempts` records each attempt even if later publication/preview fails. `RepairResult` is `checked` only after protected checks and an exact-version preview succeed; otherwise it is `no_verified_fix`. Raw diagnosis/process logs remain private. Selected attempt evidence and exact checked diffs are served through the project-scoped reads above, with `X-VibeGuard-Request: 1` required even on GET. See [the harness guide](../../harness/README.md) for adapter boundaries and laptop environment variables.

The ZIP download route now exists. Diff/evidence reads reject foreign origins, cross-site requests, and missing request headers; they never accept filesystem paths. Shared response models live in `models/repair-evidence.ts`.

US1/US2 consumers: read the [backend handoff](../../context/us1-us2-backend-handoff.md) for route behavior and pending adapters. Next: verify the demo adapters on the laptop and connect the local model using [the foundation plan](../../context/backend-foundations.md).
