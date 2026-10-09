# US5 integration

Approval, export, retained rechecks, job polling, and ZIP downloads are integrated with the runner-managed workspace. Docker Compose runs the runner; all project and release files use `VIBEGUARD_WORKSPACE` in its named volume. Originals live in `original/`; candidate files live in `versions/<versionId>/` and protected checks in `check-sets/<id>/`.

All writes require `X-VibeGuard-Request: 1` and local Host/origin protection. Jobs run immediately inside the runner, one active task at a time; a busy runner returns `409 conflict`. Restart loses jobs but retains project files and approvals. There is no queue, separate worker, or persisted job recovery.

Tests run under Vitest through the real Express app and filesystem. US5 tests seed checked candidate files and check definitions because preparation, baseline verification, and AI repair are not yet integrated. The synthetic check script proves execution and result handling, not real CRUD or database behavior. Process/container permission isolation for protected checks remains outstanding.

Run `pnpm check` for formatting, types, the combined backend suite, and builds. Docker startup, live health, and volume persistence still require verification on a Docker-enabled machine.
