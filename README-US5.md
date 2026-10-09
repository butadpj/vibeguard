# US5 integration

Approval, export, retained rechecks, job polling, and ZIP downloads are integrated with the runner-managed workspace. Docker Compose runs the runner; all project and release files use `VIBEGUARD_WORKSPACE` in its named volume. Originals live in `original/`; candidate files live in `versions/<versionId>/` and protected checks in `check-sets/<id>/`.

All writes require `X-VibeGuard-Request: 1` and local Host/origin protection. Jobs run immediately inside the runner, one active task at a time; a busy runner returns `409 conflict`. Restart loses jobs but retains project files and approvals. There is no queue, separate worker, or persisted job recovery.

Tests run under Vitest through the real Express app and filesystem. Generic release tests seed checked candidates and command checks. Demo integration tests use the protected CRUD adapter at the external Docker seam: retained checks no longer require a separate checks.json executor, and changed retained suites are rejected. These process fakes establish orchestration and result handling, not real database behavior. Use the [connected flow](context/us3-us4-backend-handoff.md) for laptop qualification.

Demo exports include the exact checked app, retained checks, manifest, RUN.md, and a trusted service-setup.json override beside the app. The override fixes PostgREST readiness and Nginx permissions without changing checked source bytes. Live exported startup still needs laptop proof.

Run `pnpm check` for formatting, types, the combined backend suite, and builds. Docker startup, live health, and volume persistence still require verification on a Docker-enabled machine.
