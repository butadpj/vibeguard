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

Current implementation: dashboard connection check; health; ZIP import and persisted lookup; editable local-model goal conversation and confirmation; baseline evidence; bounded Aider repair; matching candidate preview; approval, runnable export, and retained CRUD rechecks. The opt-in customer-tracker runtime supplies preparation, protected verification, and repair configuration. Dockerized repair mounts individual allowed files from the existing workspace volume; direct host repair uses individual bind mounts. Ollama model files remain a read-only model-only host mount. Actual file mounting and full offline Docker/CPU/PostgreSQL repair still need laptop proof. Cancellation remains pending. See the [US3/US4 handoff](us3-us4-backend-handoff.md). Baseline/repair evidence and retained checks bind protected suite bytes to the checked version. See [the runner route map](../apps/runner/README.md) for integration limits.

Developer cloud testing: Step 2 selects OpenRouter with VIBEGUARD_GOAL_PROVIDER=openrouter independently of Step 4. The runner sends goal/conversation text to OpenRouter using OPENROUTER_API_KEY; Ollama remains the offline default when unset.

Optional local goal routing uses pinned jevos-v4 through `VIBEGUARD_JEVOS_URL`. It reads the same conversation history and selects one missing-detail question; ready, uncertain, repeated-question, oversized-history, and unavailable-service cases go to the existing goal model. The `compose.jevos.yaml` overlay runs the CPU service on an internal network and selects Ollama goal conversation. Goal confirmation, repair, and protected checks keep their existing boundaries. See [setup and evaluation limits](jevos-setup.md).

Local goal conversation asks Qwen to extract three short facts: the triggering action, observed failure, and expected result. The runner asks for the first missing fact, or constructs a proposed goal immediately when all three are present. Qwen no longer chooses whether to populate a nullable goal or writes the local chat reply. Ordinary expectations (saved edits staying saved) may be inferred; observations must come from the founder. This simplifies the local model task but does not prove extraction accuracy. The cloud adapter retains its existing output contract.
