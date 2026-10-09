# Local runner

Read ../../context/system-design.md and ../../context/architecture.md. Bind to loopback. The runner owns files, processes, job state, approval, and export; the dashboard must not execute shell commands directly.

Before adding mutating endpoints, implement origin/request protection, input validation, and project-path confinement. Keep imported originals unchanged. Only test copies are editable. Acceptance checks must be outside the repair process's writable mounts; a directory name or agent prompt is not enforcement. Approval must refer to the exact version checked. Required investigation must work offline after preparation.
