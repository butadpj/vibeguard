# VibeGuard

We're building a local app that helps founders find bugs, try fixes, and check the results before keeping them.

## Run it

Install **Node.js 22.12 or newer** from [nodejs.org](https://nodejs.org/). Then install the package manager:

```sh
npm install -g pnpm@10.11.0
```

Open a terminal in the `vibeguard` repo folder and run:

```sh
pnpm install
cp -n example.env .env
docker compose up --build
```

In a second terminal, run `pnpm --filter @vibeguard/dashboard dev`.

Open **http://localhost:5173** in your browser. The top bar shows **Runner connected** when the runner is up (click it to check again).

**Open project** (step 1) is connected to the runner: choose a project ZIP, open it, then **Prepare test app**. The ordinary command has no app-startup adapter, so preparation ends in **Setup incomplete**. To enable the customer-tracker startup and baseline adapters, use the [demo backend command](context/us3-us4-backend-handoff.md); live Docker behavior still needs verification. To walk through the happy path anyway, switch **Demo data** on in the top bar; it replays sample results from the shared examples and labels them as demo data.

To try approval, saving, and rechecks before the full flow exists, add the demo project in a third terminal, then go to **Approve & keep checking** and click **Open demo project**. Running it again resets the demo.

```sh
docker compose exec runner pnpm --filter @vibeguard/runner seed:demo
```

Without Docker, run `pnpm --filter @vibeguard/runner seed:demo` instead. The demo's earlier check results are seeded, not produced by a real repair.

Install Docker with Compose before starting the backend. Keep both terminals open while you work; press **Ctrl+C** to stop. Run `docker compose up --build` again after changing backend code. Docker keeps workspace files in a named volume.

Set the goal, Catch the bug, and Try the fix call the runner, follow job progress, and display goals, checks, evidence, and code changes. A checked candidate with a matching preview can be opened for human testing, approved, exported, and rechecked. Manage AI settings in .env; example.env documents cloud and local Qwen for both goal conversation and repair. The demo Compose configuration reads those settings, and both modes use individual workspace-volume file mounts. See the [US3/US4 handoff](context/us3-us4-backend-handoff.md) for setup and direct-host alternatives. Live offline qualification remains pending.

For faster local goal clarification, add the optional [jevos CPU decision service](context/jevos-setup.md). It selects a short missing-detail question; Qwen still drafts goals and repairs code. Preparation downloads the pinned binary and model once. The Compose overlay keeps jevos on a private local network and selects local goal conversation.

## Pick an area

| Folder | Work |
| --- | --- |
| `apps/dashboard` | React UI |
| `apps/runner` | Local server, project setup, AI, and export |
| `packages/contracts` | Types shared by the UI and runner |
| `packages/design-tokens` | Shared colors, typography, and spacing |
| `verification` | Checks that prove a fix works |
| `fixtures/demo-crud` | The demo app we'll test and repair |

Format your changes before opening a PR, then run the checks:

```sh
pnpm format
pnpm check
```

Prettier formats the dashboard, runner, shared packages, and configuration with
one style. `pnpm check` checks formatting, types, runner tests, and builds. To check formatting
without changing files, run `pnpm format:check`. Generated files, local runner
data, fixtures, verification files, and Markdown documents are excluded.

## Work with your AI agent

Open this repo in your coding tool. Start with:

> Read AGENTS.md and the relevant context, then help me build [feature].

Read [PRODUCT.md](PRODUCT.md) for what we're building and [the requirements](context/scope-and-tech-requirements.md) for the demo scope. For UI work, follow [DESIGN.md](DESIGN.md), use the shared tokens, and use Impeccable if you have it installed.

See [architecture](context/architecture.md) for how the pieces fit together.

## See why a request failed

After rebuilding the runner, follow its JSON events:

```sh
docker compose -f compose.yaml -f compose.demo.yaml logs --follow runner
```

Find the failed `event: "job"` line. It includes `operation`, `job_id`, `request_id`, stage, duration, and error code. Goal jobs also include model/provider, HTTP status, token counts, and network error code when available. Repair jobs include phase, exit code, and attempt count. The matching `event: "request"` line shows HTTP status; a 202 means work started, so check the job outcome too. `X-Request-Id` is returned on API responses. Health probes are excluded.

Logs go to stdout; Compose retains them with the container. Request bodies, headers, conversation/model text, raw errors, and API keys are excluded. There is no external log service or persistent log database.
