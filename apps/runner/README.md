# Local runner

Run `pnpm dev` from the repo root. The runner listens on `127.0.0.1:4310`; Vite forwards `/api` requests to it.

## Find the code

| File or folder | Responsibility |
| --- | --- |
| [src/index.ts](src/index.ts) | Start the server and handle shutdown |
| [src/app.ts](src/app.ts) | Mount feature routes, API errors, and the built dashboard |
| [src/features/projects](src/features/projects/projects-routes.ts) | Import, project snapshot, preparation |
| [src/features/goals](src/features/goals/goals-routes.ts) | Conversation and goal confirmation |
| [src/features/checks](src/features/checks/checks-routes.ts) | Baseline checks |
| [src/features/repairs](src/features/repairs/repairs-routes.ts) | Repair and recheck |
| [src/features/approvals](src/features/approvals/approvals-routes.ts) | Approve the checked version and keep its checks |
| [src/features/exports](src/features/exports/exports-routes.ts) | Save an approved project as a ZIP or folder |
| [src/features/jobs](src/features/jobs/jobs-routes.ts) | Job polling (cancellation still `501`) |
| [src/features/checks](src/features/checks/checks-routes.ts) | Retained checks on later versions (baseline checks still `501`) |
| [src/lib/release-workspace.ts](src/lib/release-workspace.ts) | Temporary file-backed project storage that approval and export read |
| [src/lib/job-board.ts](src/lib/job-board.ts) | Temporary in-memory jobs |
| [src/lib/request-protection.ts](src/lib/request-protection.ts) | Loopback Host and Origin check for every write route |
| [src/lib/api-errors.ts](src/lib/api-errors.ts) | Shared HTTP error responses |

Health, approvals, exports, retained rechecks, job reads, and ZIP downloads work (US5). Run `pnpm --filter @vibeguard/runner test`. `release-workspace.ts` and `job-board.ts` are stand-ins: replace them with real project storage and persisted jobs by implementing the same interfaces. The other feature routes return `501` with `error.code: "not_implemented"`. Unknown API routes return a structured `404`. No feature route reads uploads, changes files, or starts jobs yet. Use [shared fixtures](../../packages/contracts/README.md) for UI development.

## Add a feature

Start with its route file and the shared contract. Keep HTTP parsing, validation, and response mapping in `<feature>-routes.ts`. Put orchestration in a sibling file named for the operation, such as `projects-prepare.ts`. Add a feature store file when persistence arrives. Pass required dependencies through the route factory from `app.ts` as features need them.

Keep feature logic beside its routes. Add shared helpers to `lib` when multiple features need them. Define shared API models only in `packages/contracts`.

Before replacing a write placeholder, add origin/request protection, input validation, and confinement to managed project paths. See [AGENTS.md](AGENTS.md) for runner rules. Update the [contract status map](../../packages/contracts/README.md) when an operation works, and run `pnpm check`.
