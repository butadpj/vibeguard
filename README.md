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
pnpm dev
```

Open **http://localhost:5173** in your browser. Click **Check connection** to confirm the runner is running.

Keep that terminal open while you work. Press **Ctrl+C** to stop. Next time, you only need `pnpm dev`.

For now, you can check the connection between the dashboard and runner. We're still building project import, AI repair, and verification.

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
one style. `pnpm check` checks formatting, types, and builds. To check formatting
without changing files, run `pnpm format:check`. Generated files, local runner
data, fixtures, verification files, and Markdown documents are excluded.

## Work with your AI agent

Open this repo in your coding tool. Start with:

> Read AGENTS.md and the relevant context, then help me build [feature].

Read [PRODUCT.md](PRODUCT.md) for what we're building and [the requirements](context/scope-and-tech-requirements.md) for the demo scope. For UI work, follow [DESIGN.md](DESIGN.md), use the shared tokens, and use Impeccable if you have it installed.

See [architecture](context/architecture.md) for how the pieces fit together.
