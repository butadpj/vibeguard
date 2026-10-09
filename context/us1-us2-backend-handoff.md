# US1 and US2 backend handoff

The routes are ready to connect. The app startup and local model are not connected yet. Use shared mock examples for successful UI flows while those adapters are being built. No user-story changes are needed.

## What the UI can call

| Action | Endpoint | Result |
| --- | --- | --- |
| Import ZIP | `POST /api/projects` | Imported `Project` |
| Refresh project | `GET /api/projects/:id` | Saved state and active job ID |
| Prepare test app | `POST /api/projects/:id/prepare` | `{ jobId }`; no request body |
| Send message | `POST /api/projects/:id/messages` | `{ jobId }`; body `{ text }` |
| Read progress/result | `GET /api/jobs/:id` | Typed job; inspect `operation`, then `status` |
| Confirm edited goal | `POST /api/projects/:id/goal/confirm` | Confirmed goal; body `{ expectedRevisionId, goal }` |

Every write needs `X-VibeGuard-Request: 1`. JSON writes also need `Content-Type: application/json`. Requests must come through the local dashboard/runner addresses. The runner accepts one active job; another start returns `409 conflict`. Cancellation is still `501`.

The default server returns a failed preparation job with `setup_incomplete` and a failed conversation job with `model_unavailable`. These are honest missing-integration results. A failed conversation saves the founder's text but does not invent an assistant reply. A valid model response creates a proposed goal; only confirmation changes it to confirmed. Use the latest revision when confirming. Stale confirmation returns `409 version_mismatch`. Confirmation clears results and current approval tied to the earlier goal.

Import and lookup work without adapters. To build the preparation/conversation happy paths now, use the examples in `@vibeguard/contracts/examples`; label them as demo data. For route-level integration, inject fake adapters into `createApp` in tests, as in `projects-foundations.test.ts`. Use mock mode for the whole happy-path flow: a frontend-only proposed goal cannot be confirmed against the live runner because its revision was never stored there. The Docker server has no hidden mock mode.

## What the app/environment engineer plugs in

Implement `PrepareEnvironment` from `apps/runner/src/features/projects/projects-prepare.ts` and pass it to `createApp({ prepareEnvironment })` at startup.

The runner provides the project/version/environment IDs, a separate writable directory, and a progress callback. Start the supported app and its real local database from that copy. Return shared setup and preview data. Report `ready` only after both services work without founder-platform services. Use the supplied environment/version IDs and a local HTTP preview URL. Return `incomplete` or `unsupported` with no previews when blocked.

The adapter owns process/container lifecycle, cleanup after partial startup, and readiness checks after restart. Imported originals are never the execution directory. The runnable demo app has not been found: `fixtures/demo-crud/` contains instructions only.

## What the model thread plugs in

Implement `GoalConversation` from `apps/runner/src/features/goals/goals-conversation.ts` and pass it to `createApp({ goalConversation })` at startup.

It receives the project ID/name, the last 20 conversation messages, and the current goal. Return `{ reply, proposedGoal }`, with a plain `GoalDraft` or `null` when asking for more details. Use the shared goal shape, including `performance: null` for non-performance goals. The runner validates output, assigns IDs/revisions, saves the reply/proposal, and leaves confirmation to the founder. The adapter must make local inference calls; it must not return hardcoded repair results.

This interface is for conversation only. Harness-based edits and repair remain in the separate model/harness thread.

## Verification

`pnpm check` runs the combined Vitest suite. Tests exercise real HTTP parsing, routes, workspace files, revision conflicts, active jobs, and missing/malformed adapter results. App startup and model output are faked only at their adapter boundaries. Docker, actual previews, model connectivity, offline inference, and real CRUD checks remain unverified here.
