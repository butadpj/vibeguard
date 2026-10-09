# US3 and US4: what to connect

**US3 can run without repair AI. US4 connects the existing harness through the demo Compose configuration or direct host runner.** The goal conversation, candidate preview, approval/export, and retained demo-check adapters are connected. Live offline qualification remains pending.

## Run the connected flow

Prepare the images and downloaded model using [the harness setup guide](../harness/README.md), and start local Ollama. Stop any other VibeGuard runner on port 4310. From `vibeguard/`, run:

```sh
export VIBEGUARD_MODELS_DIRECTORY="/usr/share/ollama/.ollama/models"
VIBEGUARD_DEMO_RUNTIME=1 \
VIBEGUARD_REPAIR_ENABLED=1 \
VIBEGUARD_OLLAMA_URL=http://127.0.0.1:11434 \
pnpm --filter @vibeguard/runner dev
```

In another terminal run `pnpm --filter @vibeguard/dashboard dev` and open http://localhost:5173. Keep Demo data off. Import the supplied ZIP, prepare it, describe the lost-edit problem in Set the goal, edit and confirm the proposed goal, then run baseline checks and try repair. The protected goal must say **Saved customer edits survive refreshing.** Open the checked preview for human testing before approving, saving, and rerunning retained checks on the original to catch the bug again.

`VIBEGUARD_GOAL_MODEL` changes the conversation model (default `qwen2.5-coder:7b`). `VIBEGUARD_REPAIR_PROFILE` selects the existing repair settings JSON. CPU repair phases may each take up to 30 minutes. Model errors and unsuccessful attempts do not establish a verified fix.

Goal conversation is enabled on ordinary startup too: direct runners default to `http://127.0.0.1:11434`, and Compose defaults to `http://host.docker.internal:11434`. After updating from an older image, run `docker compose -f compose.yaml -f compose.demo.yaml up --build -d`, refresh the project, and retry your message. If the model cannot be reached, verify Ollama is reachable from the runner and has the selected model. An explicit `VIBEGUARD_OLLAMA_URL` overrides the default.

The demo Compose configuration enables repair and defaults `VIBEGUARD_MODELS_DIRECTORY` to `/usr/share/ollama/.ollama/models`. This is the model-only folder on the Docker host, not inside the runner. Set that variable before starting Compose if your models live elsewhere. The agent receives four individual files from the managed workspace volume, with writable access only to the fix and supplemental test during editing. Originals, protected suites, and approval records are not mounted. Direct host startup continues using individual file bind mounts. OpenRouter repair profiles are explicitly online debug mode; goal conversation has its own provider setting.

Manage AI settings in vibeguard/.env; example.env lists the options. It starts with openrouter for cloud integration testing. Set VIBEGUARD_CLOUD_MODEL and OPENROUTER_API_KEY there. For local repair, choose VIBEGUARD_REPAIR_PROVIDER=ollama, set VIBEGUARD_LOCAL_MODEL to your downloaded Qwen model, and check VIBEGUARD_MODELS_DIRECTORY. Compose and direct runner startup read .env; clear old shell exports because they override file values. Direct host startup needs VIBEGUARD_OLLAMA_URL=http://127.0.0.1:11434; Docker uses http://host.docker.internal:11434. Restart the runner between choices; its startup log reports both AI models. Set VIBEGUARD_GOAL_PROVIDER=openrouter for cloud goal conversation, or ollama for local chat. VIBEGUARD_GOAL_CLOUD_MODEL optionally overrides the shared cloud model. Cloud chat sends conversation messages and the current goal to OpenRouter. See [dashboard cloud repair commands](../harness/OPENROUTER.md#use-cloud-repair-from-the-dashboard).

After updating Step 4, rebuild the backend:

```sh
docker compose -f compose.yaml -f compose.demo.yaml up --build -d
```

Refresh the dashboard, prepare the test app again, rerun baseline checks, then click Try repair. Existing imported files and confirmed goals remain in the named volume. The model and Aider images must already be prepared; repair never pulls missing images. Docker must support individual file volume subpaths; actual mounting, inference, and full repair still require laptop verification.

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

Once repair records an attempt, these reads are available:

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

These sample actions stay off the runner API and never open synthetic preview URLs. The live Set the goal screen sends conversation jobs, offers editable goals, and confirms the current revision. Imported live projects cannot borrow sample goal IDs.

Frontend API/polling/render tests run with `pnpm check`. The sandbox blocked both the Vite listener and Chrome startup, so desktop/mobile browser interactions and the full Docker-backed journey remain unverified.

If Docker preparation fails, the issue now names the failed operation and a private diagnostic filename. After rebuilding and retrying, read that file locally (replace `REPLACE` with the UUID from `setup.issue.nextStep`):

```sh
docker compose -f compose.yaml -f compose.demo.yaml exec runner cat /data/vibeguard/demo-diagnostics/REPLACE.json
```

The file contains Docker command output and, for startup failure, service logs captured before cleanup. It survives removal of the failed test environment. Review it before sharing; raw diagnostics are not served through the project API.

Dockerized preparation mounts only the required subdirectories of the runner's existing named volume, read-only. It does not translate `docker volume inspect` Mountpoint paths into host bind mounts; that translation produced a directory at `/schema.sql` on the laptop. Direct Node startup still uses explicit bind mounts with automatic source-directory creation disabled. Named-volume subpaths require a Docker Engine/Compose version supporting that feature.

When the demo runner runs as root, its Nginx test container uses a single process under that same UID. This avoids forbidden temp-file ownership changes and worker user/group switching while retaining dropped capabilities, read-only app mounts, and no Docker socket. Direct non-root runner startup keeps the ordinary Nginx worker mode. This is the small local demo server, not a production serving configuration.

Time-limited demo compromise: the dashboard web container joins a normal preview bridge as well as the internal database network so Docker can publish its loopback port. Database and REST have no host ports and stay on the internal network. The web container and verifiers sharing its network can access the internet. This configuration does **not** establish blocked-network/offline acceptance; restore isolated checks before claiming that milestone.
