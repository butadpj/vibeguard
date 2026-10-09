# Backend foundation plan

Build shared contracts first so engineers can implement their stories with matching dummy data. Replace mock implementations as the runner operations become available.

Current implementation: import/storage, single in-memory jobs, preparation/goal/baseline routes, bounded repair orchestration, and approval/export/rechecks. The opt-in demo configuration connects app/database preparation and the protected CRUD verifier; live Docker behavior remains unverified. Local conversation and qualified repair/preview adapters still need integration. Cancellation remains planned. Use the [contract status map](../packages/contracts/README.md) and [US3/US4 handoff](us3-us4-backend-handoff.md).

## Where agents should look

Use `packages/contracts` as the single source for shared API models, request/response shapes, status values, errors, and example responses. Dashboard and runner code import these definitions from the package. Keep runner implementation details in `apps/runner`.

Contract package layout:

```text
packages/contracts/
  README.md          # Contract map, endpoint list, and implementation status
  src/
    index.ts         # Public exports
    models/          # Project, goal, version, job, evidence, approval, export
    operations/      # Requests and responses grouped by operation
    examples/        # Typed fixtures for the agreed demo scenarios
```

Define each shared model once. Keep its status values beside it. Reuse those definitions in operation payloads and fixtures. Check fixtures against the exported types. If we add runtime validation, derive TypeScript types from those schemas rather than maintaining two definitions.

The package README should list each operation, its contract file, its example fixtures, and whether the runner implements it. Mark mock-only operations as planned. Keep this status map current when implementing an endpoint.

Agents changing an API should read that map, update the owning contract and examples, and update affected consumers. Avoid redeclaring shared payloads or status strings in feature code.

## Foundations

| Foundation | Responsibility |
| --- | --- |
| Shared contracts | IDs, models, operation payloads, statuses, errors, example responses |
| Project workspace | Import, preserve originals, create working copies, track code versions |
| Background jobs | Start operations, record progress/results, cancel, report failures |
| App environment | Prepare dependencies, start/stop app and database, provide preview links, isolate test data |
| Agent execution | Run the local model and harness against an allowed copy, capture output, limit repair attempts |
| Verification and export | Protect checks, retain evidence, tie approval to checked code, save a runnable project |

Run the runner in Docker Compose. Persist project files and metadata in its workspace volume. Keep one active job in memory; start it immediately and return `409 conflict` when busy. Container restart loses job state and requires a retry. No queue or persisted job recovery for this stage.

## Proposed HTTP operations

| Operation | Endpoint | Response |
| --- | --- | --- |
| Import project | `POST /api/projects` | Project ID and setup state |
| Read project | `GET /api/projects/:id` | Setup, goal, versions, previews, latest results |
| Prepare environment | `POST /api/projects/:id/prepare` | Job ID |
| Send goal message | `POST /api/projects/:id/messages` | Job ID; result includes reply and proposed goal |
| Confirm goal | `POST /api/projects/:id/goal/confirm` | Confirmed goal and revision |
| Run baseline checks | `POST /api/projects/:id/checks` | Job ID |
| Repair and recheck | `POST /api/projects/:id/repairs` | Job ID |
| Read job | `GET /api/jobs/:id` | Progress, result, or failure |
| Cancel job | `POST /api/jobs/:id/cancel` | Cancellation state |
| Approve checked version | `POST /api/projects/:id/approvals` | Approval referencing version and verification result |
| Export approved project | `POST /api/projects/:id/exports` | Job ID; result identifies saved artifact |

Use ZIP upload for the first import path unless the team agrees otherwise. A browser file picker does not supply an arbitrary local folder path; folder support needs directory upload or a local picker integration.

Long-running operations return a job ID. Start with dashboard polling through the common job endpoint.

Each job needs an ID, project ID, operation, current step, founder-readable progress, typed result or structured error, and applicable goal-revision/code-version references. Proposed lifecycle: `running | succeeded | failed | cancelled`.

Separate execution status from check verdicts. A completed check job can succeed while its result reports `failed` checks. Verification verdicts are `passed | failed | could_not_check`. Errors should include a stable code, readable message, and a next step where available.

## Internal integration boundaries

| Component | Input and output to agree |
| --- | --- |
| Environment | Prepare/start/stop a managed workspace; return environment ID, readiness, and preview URL |
| Agent | Work on an allowed copy; return a proposed goal or candidate version |
| Verifier | Check a code version against a confirmed goal; return verdict and evidence |
| Exporter | Package an approved checked version; return a saved artifact |

Use runner-managed resource IDs at these boundaries. The runner resolves paths and permissions. Keep shell commands and Docker mounts out of dashboard payloads.

Before adding mutating endpoints, implement request/origin protection, input validation, and project-path confinement. Leave imported originals unchanged. Enforce protected checks through process/container permissions. Allow two repair attempts. Changed code requires new checks; changed goals require confirmation. Approval must reference the exact checked version.

## Dummy data for parallel story work

Share fixtures for: setup incomplete, project ready, baseline failed, repair checked, repair unsuccessful, and export saved. Include progress and recoverable error examples.

The dashboard should use an API client with mock and HTTP implementations that share these contracts. Engineers can build screens against fixtures while backend owners implement operations. Mock responses must not claim real runtime verification.

## Build order

1. Agree on models, operation contracts, statuses, fixtures, and internal interfaces.
2. Implement project storage and jobs, with request validation and workspace protections.
3. Run the chosen demo app and database and return a working preview URL.
4. Run a protected baseline check and return real evidence through the job API.
5. Connect the local agent, repair/recheck loop, approval, and export.

Alongside the early foundation work, prove the chosen local model and harness can repair the demo app on the demo laptop. Prepare downloads online, then prove investigation, repair, and checks work offline.

See the [agent harness plan](agent-harness-plan.md) for the parallel laptop/model experiment, Ollama and Aider integration, and contract coordination needs.

First integration milestone: **import → prepare → preview → run a real check → display evidence**.

Product scope and acceptance rules: [requirements](scope-and-tech-requirements.md). Runtime layout and ownership: [architecture](architecture.md).
