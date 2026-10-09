# Shared contracts

Start here for API payloads, shared models, statuses, and dummy data. Import types from `@vibeguard/contracts`; import fixtures from `@vibeguard/contracts/examples`.

These contracts describe the agreed first integration shape. The runner currently implements only health. The runner registers other listed routes as `501 not_implemented` placeholders. The artifact download URL in fixtures is planned. TypeScript types do not validate HTTP input; add runtime validation when implementing routes.

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

The demo fixture directory currently contains instructions only. Wire the chosen app's concrete setup checks into the runner when its runnable fixture is available.

## Operations and implementation status

Request/response aliases live in [operations/api.ts](src/operations/api.ts). Read the matching named exports in [examples/index.ts](src/examples/index.ts) for payloads. Resource IDs in URL segments stay out of JSON bodies. Preparation and cancellation have no request body.

| Endpoint | Types / response | Examples | Runner |
| --- | --- | --- | --- |
| `GET /api/health` | `HealthResponse` | `healthExample` | Implemented |
| `POST /api/projects` | `ImportProjectRequest` → `ImportProjectResponse` | See ZIP upload below; `importedProjectExample` | Scaffolded (501) |
| `GET /api/projects/:id` | `GetProjectResponse` | `demoScenarios` | Scaffolded (501) |
| `POST /api/projects/:id/prepare` | `PrepareProjectResponse` | `acceptedJobExample`, `preparingJobExample`, `preparedJobExample` | Scaffolded (501) |
| `POST /api/projects/:id/messages` | `SendMessageRequest` → `SendMessageResponse` | `messageRequestExample`, `conversationJobExample` | Scaffolded (501) |
| `POST /api/projects/:id/goal/confirm` | `ConfirmGoalRequest` → `ConfirmGoalResponse` | `confirmGoalRequestExample`, `confirmedGoalExample` | Scaffolded (501) |
| `POST /api/projects/:id/checks` | `RunChecksRequest` → `RunChecksResponse` | `checksRequestExample`, `baselineJobExample` | Scaffolded (501) |
| `POST /api/projects/:id/repairs` | `RepairRequest` → `RepairResponse` | `repairRequestExample`, `repairJobExample`, `unsuccessfulRepairJobExample` | Scaffolded (501) |
| `GET /api/jobs/:id` | `GetJobResponse` | Job examples, including `interruptedJobExample` | Implemented for in-memory jobs (US5); no restart recovery yet |
| `POST /api/jobs/:id/cancel` | `CancelJobResponse` | `cancelledJobExample` | Scaffolded (501) |
| `POST /api/projects/:id/approvals` | `ApproveFixRequest` → `ApproveFixResponse` | `approveRequestExample`, `approvalExample` | Implemented (US5) on a temporary file-backed workspace |
| `POST /api/projects/:id/exports` | `ExportProjectRequest` → `ExportProjectResponse` | `exportRequestExample`, `exportedJobExample` | Implemented (US5) |
| `GET /api/artifacts/:id/download` | ZIP bytes | `exportSavedExample.downloadUrl` | Implemented (US5) |
| `POST /api/projects/:id/rechecks` | `RecheckRequest` → `RecheckResponse` | `recheckRequestExample` | Implemented (US5) |

Long-running operations return `JobAccepted` (`{ jobId }`). Poll the job to get its result. Success responses use the named payload directly. API failures use `ErrorResponse` (`{ error: { code, message, nextStep } }`) with an appropriate non-2xx HTTP status. Cancellation returns the current job; a completed job may finish before cancellation reaches it.

For ZIP import, send multipart form data with `file` and optional `name`. The `Blob` field describes the browser input, not JSON or the runner's parsed upload object:

```ts
const body = new FormData();
body.append('file', selectedZipFile);
body.append('name', 'Task app');
// Send body to POST /api/projects when the runner implements it.
```

## Rules for consumers and agents

- Reuse exported definitions. Add shared model fields and status values here before changing consumers.
- Narrow a job by `operation`, then `status`, to read its result. A successful check job can contain failed checks. A successful repair job can return `no_verified_fix`.
- Treat fixtures as synthetic UI data. They provide no proof of repair capability. Clone fixtures before mutating them in a stateful mock client.
- Treat IDs as opaque. The runner resolves files and environments. `savedLocation` is display text, not an input path.
- The runner must validate goal/version/check references, protected check identity, required CRUD verdicts, and the two-attempt limit. Types alone cannot enforce these runtime rules.
- Store attempt history on the job so cancellation, failure, and restart retain consumed attempts. Use `interrupted` when restart ends unfinished work.
- Update this status table, operation payloads, examples, and affected consumers together. Run `pnpm check` from the repo root.

US5 retained checks: `POST /rechecks` starts a `check` job on a later version using the checks saved with an approval. A check that passed at approval and fails now says so in its `explanation`. The runner reads retained checks from `checks.json` in the check-set folder. Each entry has `id`, `name`, `scope`, `command` (`node`, `python`, or `python3`), `args`, and `timeoutMs`. Exit code 0 is `passed`, 1 is `failed`, and anything else is `could_not_check`. The check reads the folder to test from `VIBEGUARD_TARGET_DIR`. Verification should confirm or replace this format.

The ZIP download route now exists. Diff and evidence artifacts still need access rules before they are served.

Next step: project storage and background jobs in [the foundation plan](../../context/backend-foundations.md).
