# US3 and US4: what to connect

**US3 can run without AI. US4 still needs the qualified harness.** The demo runtime adapter is connected, but its live Docker/database behavior has not passed a laptop run yet.

## Start the demo backend

From `vibeguard/`, with Docker running:

```sh
docker compose -f compose.yaml -f compose.demo.yaml up --build
```

This configuration gives the trusted runner Docker access so it can start the app and databases. The runner runs as root; the app, verifier, and agent do not receive its Docker socket. The ordinary `docker compose up --build` command still starts the API without these demo adapters.

Import [customer-tracker.zip](../fixtures/demo-crud/customer-tracker.zip), then click **Prepare test app**. Preparation downloads missing images while online, runs readiness checks against the app and database, and returns a preview URL. Cached images are reused. The database is synthetic and separate from any production data. Other project setups are unsupported by this adapter.

Preparation explicitly binds the PostgREST admin health endpoint to loopback and gives read-only Nginx temporary cache space. These fixes match the standalone harness trial setup; rebuild the runner to use them.

If preparation fails, read `setup.issue` and the failed job. A runner health response alone does not prove the demo app works.

## US3: show the baseline

After a real proposed goal has been confirmed, send:

```text
POST /api/projects/:id/checks
{ "versionId": "<originalVersion.id>", "goalRevisionId": "<goal.revisionId>" }
```

Send `X-VibeGuard-Request: 1`. Poll `GET /api/jobs/:jobId`, then refresh `GET /api/projects/:id` and render `baseline.checks`.

The current protected goal is **“Saved customer edits survive refreshing.”** Use that exact `expectedBehavior` for this fixture, with `performance: null`. Another goal gets an inconclusive goal check; this suite cannot establish arbitrary requirements. The conversation/model adapter is still pending—these changes do not invent a proposed goal to bypass it.

Checks use the application's customer actions, the real Supabase client, and independent reads of saved database state. Each run starts a new app/database with its own synthetic data, then removes it. The founder's preview data stays separate. On the intentionally broken ZIP, we expect create/read/delete to pass and update/goal to fail. **That outcome remains expected, not live proof.**

## US4: show the recorded change

The other thread owns repair execution. Once it records an attempt, these reads are available:

| Read | Use |
| --- | --- |
| `GET /api/projects/:id/repair-evidence` | Latest recorded attempts for the current goal, text changes, and their verification results |
| `GET /api/projects/:id/diffs/:artifactId` | Exact checked candidate's diff; use the repair job's `diffArtifactId` |

Both reads require `X-VibeGuard-Request: 1`. Use shared `GetRepairEvidenceResponse` / `GetRepairDiffResponse` types. Synthetic examples are `repairEvidenceExample` and `repairDiffExample`.

For before/after results, compare `Project.baseline` with the recorded candidate verification. Show source changes as text. Raw model prompts, tool output, filesystem paths, and arbitrary workspace files are not served. A failed attempt may have evidence without a checked diff or usable candidate preview. Changed candidate bytes are rejected. Old-goal records are excluded.

**Passing checks gives a candidate for human testing. It does not approve it.** Keep **No verified fix ready** for failed or inconclusive repairs.

## What still needs proof

`pnpm check` tests routes, storage, validation, and orchestration with Docker/model processes faked. Docker configuration parses, but this session cannot start containers because socket access is blocked. On the laptop, verify preview readiness, the actual broken baseline, database isolation, restart/persistence, cleanup, and operation with internet access blocked. Then connect the qualified harness and candidate preview adapter.

Normal shutdown removes its previews. Starting with the demo configuration also cleans recorded environments left by a killed runner and marks old previews incomplete. Automatic cleanup failure stops startup rather than claiming readiness. For manual recovery, use the runner-managed config (replace the name with the actual `vg-demo-*` directory):

```sh
docker compose -f compose.yaml -f compose.demo.yaml run --rm --no-deps --entrypoint docker runner \
  compose -p vg-demo-REPLACE -f /data/vibeguard/demo-runtime/vg-demo-REPLACE/compose.json \
  down -v --remove-orphans
```

This deletes only that demo's synthetic data. Re-prepare after restarting the runner. Imported project files and saved results remain; preview test data is disposable.

## Try the frontend

**Catch the bug** starts checks, follows the job, then reloads `Project.baseline`. **Try the fix** follows repair progress and attempts, reads protected evidence and the returned diff, and offers the matching checked candidate preview for human QA. Failed/inconclusive repair results show **No verified fix ready**. Check results include verdicts, evidence disclosures, and recorded timings. Active check/repair jobs are followed after a page reload; lost jobs report an error. Use **Refresh project** after restarting the runner.

For a UI walkthrough without the pending adapters:

1. Start the dashboard with `pnpm --filter @vibeguard/dashboard dev`.
2. Turn **Demo data** on, use the sample project, and prepare it.
3. Open **Catch the bug**, click **Use sample confirmed goal**, then **Run baseline checks**.
4. Continue to repair. **Try repair** shows the successful sample; **Show unsuccessful sample** shows the two-attempt failure.

These sample actions stay off the runner API and never open synthetic preview URLs. The live UI requires a real confirmed goal; the **Set the goal** frontend is still a placeholder. Imported live projects cannot borrow sample goal IDs.

Frontend API/polling/render tests run with `pnpm check`. The sandbox blocked both the Vite listener and Chrome startup, so desktop/mobile browser interactions and the full Docker-backed journey remain unverified.

If Docker preparation fails, the issue now names the failed operation and a private diagnostic filename. After rebuilding and retrying, read that file locally (replace `REPLACE` with the UUID from `setup.issue.nextStep`):

```sh
docker compose -f compose.yaml -f compose.demo.yaml exec runner cat /data/vibeguard/demo-diagnostics/REPLACE.json
```

The file contains Docker command output and, for startup failure, service logs captured before cleanup. It survives removal of the failed test environment. Review it before sharing; raw diagnostics are not served through the project API.

Dockerized preparation mounts only the required subdirectories of the runner's existing named volume, read-only. It does not translate `docker volume inspect` Mountpoint paths into host bind mounts; that translation produced a directory at `/schema.sql` on the laptop. Direct Node startup still uses explicit bind mounts with automatic source-directory creation disabled. Named-volume subpaths require a Docker Engine/Compose version supporting that feature.

When the demo runner runs as root, its Nginx test container uses a single process under that same UID. This avoids forbidden temp-file ownership changes and worker user/group switching while retaining dropped capabilities, read-only app mounts, and no Docker socket. Direct non-root runner startup keeps the ordinary Nginx worker mode. This is the small local demo server, not a production serving configuration.

Time-limited demo compromise: the dashboard web container joins a normal preview bridge as well as the internal database network so Docker can publish its loopback port. Database and REST have no host ports and stay on the internal network. The web container and verifiers sharing its network can access the internet. This configuration does **not** establish blocked-network/offline acceptance; restore isolated checks before claiming that milestone.
