# Initial architecture

Accepted starting direction, 2026-10-09: pnpm workspace; React + Vite + TypeScript SPA; long-running Node.js + TypeScript local runner. No monorepo task orchestrator needed yet.

Contributors start the runner with `docker compose up --build`; workspace files live in a named Docker volume. Jobs run in that runner process, one at a time, with in-memory state and no queue. Export, retained recheck, preparation, and message jobs are implemented. Preparation and conversation require app/model adapters; repair remains a placeholder.

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

Current implementation: dashboard connection check; health; ZIP import and persisted lookup; approval, export, and retained rechecks of seeded checked versions; serving the built UI. Docker Compose is configured but still needs runtime verification. Preparation and goal API plumbing is implemented; app/model adapters, real baseline integration checks, AI repair, and cancellation remain pending. The baseline route accepts a trusted verifier adapter and persists evidence. See [the runner route map](../apps/runner/README.md) for integration limits.
