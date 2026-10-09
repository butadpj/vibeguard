# Open decisions

- Prove the demo CRUD stack, local model, and coding harness on the demo laptop through a real offline repair.
- Select the founder installer format and supported operating systems after the local flow works.
- Define job/evidence contracts with the first integrated story.
- Docker startup, live health, and volume persistence still need a smoke test on a Docker-enabled machine.
- Extract shared layout/components as the dashboard grows. DESIGN.md describes the intended full flow; the current dashboard only implements the connection-check screen.
- Preparation/repair must publish checked candidates in the runner workspace and populate version-bound evidence before US5 is usable end to end. Imports and release features share `VIBEGUARD_WORKSPACE`, original version resolution, and digest framing. Jobs stay in memory: one active operation, no queue or persisted recovery.
- Confirm the retained-check format (`checks.json`, exit codes, `VIBEGUARD_TARGET_DIR`) with verification, or change `check-executor.ts` to match.
