# Initial architecture

Accepted starting direction, 2026-10-09: pnpm workspace; React + Vite + TypeScript SPA; long-running Node.js + TypeScript local runner. No monorepo task orchestrator needed yet.

Contributors start the runner with `docker compose up --build`; workspace files live in a named Docker volume. Jobs run in that runner process, one at a time, with in-memory state and no queue. Export, retained recheck, preparation, message, and bounded repair jobs are implemented. Preparation/conversation/repair require their app/model/verifier adapters; the default server has no qualified live repair adapter. See [the standalone harness guide](../harness/README.md).

During development Vite proxies /api to the runner on 127.0.0.1:4310. After building, the runner serves the dashboard and API from that same local address. The founder product will package both together, launch the runner, and open the browser. pnpm commands are contributor setup, not the finished nontechnical installation experience. Installer format and supported OS remain undecided.

## Ownership

| Area | Initial responsibility |
| --- | --- |
| apps/dashboard | Engineer 1: founder flow and UI |
| apps/runner | Engineer 2: orchestration, AI integration, approval/export |
| apps/runner environment modules and fixtures/demo-crud | Engineer 3: preparation, Docker, app copies, preview/data isolation |
| verification | Engineer 4: protected checks and evidence |
| packages/contracts | Shared: coordinate interface changes |
| packages/design-tokens | Shared visual foundation |

Runtime job state lives in the runner; the dashboard renders it. Future contracts must identify project/job, confirmed goal, source and repaired versions, setup state, evidence, preview URL, and approval/export state. Define actual schemas with their first feature rather than inventing a complete API now.

Keep preparation downloads distinct from offline work. Verification code in this repo is team-owned. The runtime repair process must receive only the project copy and explicitly allowed tooling, with protected checks mounted outside its write permissions.

Current implementation: dashboard connection check; health; ZIP import and persisted lookup; approval, export, and retained rechecks; serving the built UI; bounded repair orchestration and an isolated Aider wrapper with a standalone trial command. Docker/CPU/PostgreSQL execution still needs laptop proof. Preparation, goal, baseline, and repair API plumbing use injected adapters; the opt-in customer-tracker configuration now connects startup and protected baseline verification, with live Docker behavior unverified. Local conversation, qualified repair/preview configuration, and cancellation remain pending. See the [US3/US4 handoff](us3-us4-backend-handoff.md). Baseline/repair evidence now binds protected suite bytes to the checked version. See [the runner route map](../apps/runner/README.md) for integration limits.
