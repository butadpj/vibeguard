# US5 drop-in

Copy everything in this folder over your vibeguard repo root. Paths match the repo.

New files: runner features/lib, dashboard `components/ApprovalPanel.*`, `release-flow.test.ts`.
Edited files (overwrite): `app.ts`, the approvals/checks/exports/jobs route files, `api-errors.ts`,
contracts `api.ts` and `examples/index.ts`, `tokens.css`, `apps/runner/package.json` (adds a `test` script),
and three docs (contracts README, runner README, context/gaps.md).

No new npm packages. Then run:

    pnpm install
    pnpm check
    pnpm --filter @vibeguard/runner test
