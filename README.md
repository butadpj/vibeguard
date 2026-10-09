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
docker compose up --build
```

In a second terminal, run `pnpm --filter @vibeguard/dashboard dev`.

Open **http://localhost:5173** in your browser. Click **Check connection** to confirm the runner is running.

Install Docker with Compose before starting the backend. Keep both terminals open while you work; press **Ctrl+C** to stop. Run `docker compose up --build` again after changing backend code. Docker keeps workspace files in a named volume.

The runner supports ZIP import and project lookup. Approval, export, and retained rechecks are available for checked versions, but preparation, baseline verification, and AI repair are not yet connected into a complete flow.

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
