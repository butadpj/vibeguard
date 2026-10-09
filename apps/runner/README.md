# Local runner

From the repo root, run `docker compose up --build`. Compose runs the backend at `http://127.0.0.1:4310`. Start the dashboard separately with `pnpm --filter @vibeguard/dashboard dev`; Vite forwards `/api` requests to the runner.

Compose stores workspace files in the `runner-data` volume at `/data/vibeguard`. Rebuild after backend changes. `docker compose down` stops/removes the container and retains the volume. The image currently includes only the runner; AI tooling and app containers come with their features.

Jobs will run inside this runner process, one operation at a time, with in-memory progress. No queue or separate worker. Restarting the container loses job state; project files survive. Export, retained recheck, preparation, and message jobs are implemented; preparation and conversation need their adapters to succeed.

For direct Node development, `pnpm dev` still starts both apps. The runner defaults to loopback and `.vibeguard` relative to its working directory. Configure `VIBEGUARD_WORKSPACE` to change storage. Compose sets `VIBEGUARD_HOST=0.0.0.0` inside the container and publishes the port only on host loopback.

## Find the code

| File or folder | Responsibility |
| --- | --- |
| [src/index.ts](src/index.ts) | Start the server and handle shutdown |
| [src/config.ts](src/config.ts) | Listener and workspace configuration |
| [src/app.ts](src/app.ts) | Mount feature routes, API errors, and the built dashboard |
| [src/features/projects](src/features/projects/projects-routes.ts) | Import, project snapshot, preparation |
| [src/features/goals](src/features/goals/goals-routes.ts) | Conversation and goal confirmation |
| [src/features/checks](src/features/checks/checks-routes.ts) | Baseline jobs and evidence; verifier adapter pending |
| [src/features/repairs](src/features/repairs/repairs-routes.ts) | Repair and recheck |
| [src/features/approvals](src/features/approvals/approvals-routes.ts) | Approve the checked version and keep its checks |
| [src/features/exports](src/features/exports/exports-routes.ts) | Save an approved project as a ZIP or folder |
| [src/features/jobs](src/features/jobs/jobs-routes.ts) | Job polling (cancellation still `501`) |
| [src/features/checks](src/features/checks/checks-routes.ts) | Retained checks on later versions (real baseline suite not yet connected) |
| [src/lib/release-workspace.ts](src/lib/release-workspace.ts) | Managed project/version storage that approval and export read |
| [src/lib/job-board.ts](src/lib/job-board.ts) | One active in-memory job |
| [src/lib/request-protection.ts](src/lib/request-protection.ts) | Local Host/origin and request-header protection for every write route |
| [src/lib/api-errors.ts](src/lib/api-errors.ts) | Shared HTTP error responses |

Health, ZIP import, project lookup, approvals, exports, retained rechecks, repair job plumbing, job reads, and ZIP downloads are implemented. Repair produces checked versions only when its isolated agent, protected verifier, and candidate preview adapters are supplied; the default server reports `harness_unavailable`. Cancellation still returns structured `501 not_implemented`. Unknown API routes return a structured `404`.

All features use the configured runner workspace (`VIBEGUARD_WORKSPACE`), stored in the Compose volume. Original files remain in `original/`; candidate versions use `versions/<versionId>/`, and protected check sets use `check-sets/<id>/`. Jobs start immediately in the runner process, one active operation at a time; another start returns `409 conflict`. Jobs are lost on restart; project files and approvals persist. No queue or separate worker.

## Add a feature

Start with its route file and the shared contract. Keep HTTP parsing, validation, and response mapping in `<feature>-routes.ts`. Put orchestration in a sibling file named for the operation, such as `projects-prepare.ts`. Add a feature store file when persistence arrives. Pass required dependencies through the route factory from `app.ts` as features need them.

Keep feature logic beside its routes. Add shared helpers to `lib` when multiple features need them. Define shared API models only in `packages/contracts`.

Before replacing a write placeholder, add origin/request protection, input validation, and confinement to managed project paths. See [AGENTS.md](AGENTS.md) for runner rules. Update the [contract status map](../../packages/contracts/README.md) when an operation works, and run `pnpm check`.

## ZIP import and lookup

`POST /api/projects` accepts multipart `file` and optional `name` (1–100 characters), returning the shared `Project` with `not_prepared` setup. Send `X-VibeGuard-Request: 1` on every write request. Browser origins and Host must use HTTP localhost or 127.0.0.1 on port 4310 or 5173; cross-site requests are rejected. CLI clients may omit Origin but must supply the custom header. Vite proxies the header to the runner.

Uploads are limited to 20 MiB including multipart overhead, 100 MiB expanded, and 2,000 ZIP entries. Only stored/deflated regular files and directories are accepted; ZIP64, encrypted archives, links, unsafe paths, duplicate paths, corrupt content, and file/directory collisions are rejected. No imported code is executed. Originals retain exact file bytes but not archive permission bits; files are stored read-only. Keep future execution and repair confined to separate copies; these modes alone do not sandbox a process running as the runner user.

`GET /api/projects/:id` loads persisted metadata. Import uses a staging directory and publishes only completed projects. It retains the exact `upload.zip`, an `original/` tree, and `project.json`. Aborted processes can leave hidden staging directories; automatic recovery/cleanup is not implemented. Version digests cover sorted file paths and bytes, not ZIP timestamps or permissions.

Run `pnpm --filter @vibeguard/runner test` for Vitest, or `pnpm test` from the repo root. `pnpm check` includes the suite. Feature tests live beside their routes as `*.test.ts` and import source directly. The production build excludes tests and the testing harness.

The tests send encoded HTTP requests through the real Express app with an in-process Node HTTP transport; multipart parsing, protection, routes, errors, and temporary filesystem storage stay real. They follow the platform-api pattern of app-level requests, structured response assertions, and table-driven rejection cases. Recreating the app proves persisted lookup without in-memory state; it does not prove a process or container restart. The earlier Node route/storage tests are replaced by these broader journeys. No coverage percentage is recorded.

Docker startup, live HTTP health, process restart, and volume persistence still need verification on a machine with Docker available. The in-process transport does not exercise network binding or chunked HTTP responses.

## US1/US2 route plumbing

Preparation, messaging, and goal confirmation are implemented. The default server has no app startup or local model adapter; it reports `setup_incomplete` or `model_unavailable` through failed jobs. It does not manufacture previews, assistant replies, or proposed goals. Goal confirmation requires a current revision and creates a new confirmed revision; previous baseline, latest verification, and current approval are cleared.

`createApp` accepts `prepareEnvironment` and `goalConversation` implementations. Their private interfaces live beside their feature operations. Preparation creates an editable copy under `projects/<id>/environments/<environmentId>/`, verifies original content, and accepts `ready` only with matching version/environment IDs and a local HTTP preview. The adapter owns actual app/database readiness, process cleanup (including partial startup failures), and future restart revalidation. Those are not implemented by the route plumbing. No app is executed from its imported original.

Project reads report the active job from process memory; it is not persisted. Message input is limited to 4,000 characters, proposed description/expected behavior to 4,000 each, performance action to 500, and model reply to 6,000. Model input includes the last 20 messages. Malformed JSON and invalid structured output fail without publishing an assistant reply or goal. Founder messages survive a model failure.

See the [US1/US2 handoff](../../context/us1-us2-backend-handoff.md). Cancellation, real app startup, local model connectivity, and process/container restart behavior remain outstanding. Tests use injected adapter fakes and do not establish those capabilities.

## Baseline jobs and evidence

`POST /api/projects/:id/checks` accepts `{ versionId, goalRevisionId }`. It requires ready app setup, the imported original version, and a currently confirmed goal. The operation runs as a `check` job in the same single-task runner. Refresh the project to read its persisted `baseline`; poll the job for the result and progress. Successful job completion can contain a failed or inconclusive check verdict.

Inject a trusted `BaselineChecks` adapter through `createApp({ baselineChecks })`. Its `checkSetId` resolves to the runner-managed project's check-set directory. The runner creates a fresh editable copy, validates structured evidence, checks original/suite digests before publication, and removes the scratch copy. The adapter owns real app/database startup, finite timeouts, and cleanup. It must exercise application behavior and persisted data with goal/create/read/update/delete coverage. Missing coverage is inconclusive. The default Docker server has no verifier adapter and reports `check_unavailable` after setup/goal gates pass. These routes do not establish actual CRUD verification yet.

Digest checks do not sandbox a process. Enforce protected suite/original/metadata permissions when connecting the agent. See the [integration handoff](../../context/us1-us2-backend-handoff.md).

## Local repair jobs

`POST /api/projects/:id/repairs` accepts the shared `{ sourceVersionId, goalRevisionId, baselineVerificationId }` and returns a repair job ID. It requires ready setup, the imported original, the current confirmed goal, and its failed baseline. The operation shares the in-memory single-job board with checks, preparation, and export. Polling exposes progress and attempts, including failures before publication.

Supply `createApp({ repairHarness, baselineChecks })`. The harness contains the isolated agent, relevant skill principles as actual text, and the environment owner's candidate-preview callback. Verification reuses `BaselineChecks`; it must start a fresh real PostgreSQL environment for each copy and clean it up. No preparation or default baseline adapter is replaced by this work. The standalone trial uses the same operation with a dedicated Docker qualification helper. See [harness/README.md](../../harness/README.md) for the command, required `VIBEGUARD_MODELS_DIRECTORY`, replaceable settings, permissions/network design, and integration limitations.

Each of two attempts permits one read-only diagnosis and one edit invocation. The runner requires a complete focused plan, reviews actual fix/test file changes, runs supplemental tests, and verifies a distinct frozen candidate through protected checks. All goal/CRUD scopes must pass. A successful exact-version preview publishes the checked candidate; exhaustion or an inconclusive verifier publishes none. Evidence stays under `projects/<id>/repairs/<trialId>/attempt-<n>/`, separate from agent mounts. Approval rejects changed candidate/suite bytes and saves the checked version identity. The live Docker/CPU/PostgreSQL trial, timeout calibration, offline rehearsal, and founder QA are still laptop-only proof; fake model/storage tests do not establish them.

## Customer-tracker runtime and repair evidence

Enable the concrete demo preparation/baseline adapters with `docker compose -f compose.yaml -f compose.demo.yaml up --build`. Only the trusted runner receives Docker access. It starts reviewed services against separate managed copies, downloads only missing images during preparation, requires cached images for checks, and removes each check database afterward. Protected suite digests include the client/helper bytes. On startup it cleans its recorded disposable environments and invalidates old previews; project files, goals, and results remain. Live container/database and offline behavior remain unverified.

`GET /api/projects/:id/repair-evidence` serves the latest recorded attempts for the current goal. `GET /api/projects/:id/diffs/:artifactId` serves the exact checked candidate's text changes. Both require `X-VibeGuard-Request: 1`, local origin/Host checks, and return uncached structured contracts. Raw prompts/tool logs are private. Candidate/original bytes must match the saved diff before a checked diff is served.

See the [US3/US4 handoff](../../context/us3-us4-backend-handoff.md) for the supported goal, frontend reads, and laptop validation. The default server still has no local conversation or qualified repair harness.
