# Repair harness implementation

Read this when changing the wrapper or connecting it to the runner. For laptop commands, use [the trial guide](README.md).

## Operation

The standalone command and repair API call `runRepairTrial`. Both permit two attempts. Each attempt starts from original bytes and allows one diagnosis invocation, then one edit invocation.

1. Require a failed baseline for the confirmed goal, with all goal/CRUD scopes present and no inconclusive result.
2. Run read-only diagnosis. Require structured cause, evidence, affected files, fix plan, risks, and test plan.
3. Pass that plan and the text in `principles.md` into the edit invocation.
4. Review actual file changes against the allowed scope. Run agent-written tests.
5. Copy the candidate into a separate snapshot. Run protected checks against another copy with a fresh PostgreSQL database.
6. Publish only after every required check passes and the preview matches the checked bytes.

The diagnosis prompt includes the required JSON value types and an example matching the parser. The second diagnosis receives the previous failure's evidence. Progress reports each failed attempt's reason and elapsed time before any retry. An unavailable model, inconclusive verification, changed protected files, or failed container cleanup stops further attempts. Failure publishes no candidate. Docker model-start failures retain the process output and profile in the attempt evidence; the standalone command also prints the startup error.

## Permissions and network access

| Process | Files it receives | Network |
| --- | --- | --- |
| Aider diagnosis | Read-only `app.js`, `client.js`, `customers.js`, `customers.test.mjs` | Private Docker network with Ollama |
| Aider edit | Same files; only `customers.js` and `customers.test.mjs` writable | Same private network |
| Agent-written tests | Read-only fix/test files | None |
| Protected verifier | Read-only candidate `customers.js`, protected suite, trusted fixture/client files | The trial web container's network namespace |
| Ollama | Read-only model folder | Private Docker network; no published port |

Aider receives no originals, acceptance checks, imported configuration, credential files, approval state, host directories, or Docker socket. Containers use a non-root UID, a read-only root filesystem, dropped capabilities, and `no-new-privileges`. Docker internal networks block external access.

`invoke.py` probes protected writes, socket absence, and an external connection before inference. It disables Aider reflections, automatic lint/test repair, commits, update checks, analytics, imported configuration, and provider retries. It permits one completion request per phase. The image caches tokenizer data during online preparation.

The standalone environment uses trusted fixture Compose/schema files, with a unique project and database volume for each check. It mounts candidate web files read-only. Browser previews add a trusted Nginx proxy connected to the internal app network and a separate host-facing bridge, publishing only on loopback. Its generated, read-only configuration forwards only to `web:8080`; app, database, and verifier remain on the internal network. A bounded host HTTP probe must reach the app's health endpoint before the preview URL is returned. It runs the existing `verification/demo-crud/baseline.mjs`. Each check removes its services and volumes afterward; a successful preview stays running for human QA. The preparation owner's adapter needs an equivalent host-facing boundary; it is not changed by this standalone fix.

`repair-preview.ts` reopens saved passing trial evidence without another inference call. It checks the candidate digest, protected suite digest, and all required verdicts before starting a new preview and checks the candidate digest again afterward. Its database is fresh; it does not claim to have rerun integration checks.

The demo laptop's cloud trial `r80KwM` completed attempt 1 with three passing agent-written tests and all five protected PostgreSQL checks passing. Recorded attempt duration was 72,258 ms; diagnosis took 18,255 ms. The original preview was healthy inside Docker but unreachable from the browser. Host proxy changes still require laptop verification, followed by human edit/refresh/create/delete QA. This is cloud repair evidence, not offline Qwen qualification.

The standalone override sets `PGRST_ADMIN_SERVER_HOST=127.0.0.1` so PostgREST's `--ready` probe can reach its admin endpoint. The preparation adapter needs the same setting when using this probe; PostgREST's default wildcard host is rejected by the probe. Failed startup saves service logs and REST health-check output in `startup-diagnostics.json` before removing containers.

Non-root Nginx receives a 16 MB temporary mount at `/var/cache/nginx`, owned by its configured UID/GID. It needs this writable directory for its default FastCGI, uWSGI, and SCGI temp paths even when the app only uses proxying. The preparation adapter needs equivalent writable temp paths; candidate application files stay read-only.

## Settings

### OpenRouter debug mode

`defaultOpenRouterProfile` opts into `provider: 'openrouter'`, defaults to `anthropic/claude-sonnet-5.5`, and uses a 32,768-token input/output budget, 4,096-token output cap, and five-minute phase timeout. These are request budgets; cloud mode does not claim CPU inference, a loaded-model context, or model-weight digest evidence. It records the requested model, provider-reported model, response ID, usage, wrapper version, and container image IDs.

Aider remains on an internal network. Only a separate trusted gateway joins a dedicated outbound network. The gateway has no source mounts, publishes no port, holds the OpenRouter key, and forwards one bounded non-streaming completion per phase to the fixed OpenRouter endpoint. It sets low reasoning effort and disables provider fallbacks. Agent-written tests remain network-free. Actual Docker enforcement and provider compatibility need laptop proof.

Use `createAiderSandbox(profile, null, undefined, openRouterApiKey)` when injecting this adapter into the runner. Keep the key outside profile JSON and evidence. Standalone mode reads `OPENROUTER_API_KEY`; `--openrouter` selects the cloud defaults, and `VIBEGUARD_CLOUD_MODEL` replaces the default model ID. A profile JSON with `provider: 'openrouter'` can also select this mode. See [the cloud commands](OPENROUTER.md).

`pnpm check` includes three standard-library Python gateway journeys: bounded forwarding and retry rejection, request validation, and provider failure without credential leakage. They fake the upstream provider and HTTP transport; they do not contact OpenRouter. Python 3 is required for these checks.

An agent-environment smoke check also ran the installed Aider 0.86.2 and its actual LiteLLM client through the real gateway handler against a fake OpenRouter response. It completed one call successfully. This proves client/handler wiring, not real provider latency or Docker networking. Provider failures are recorded as blockers and stop repair attempts until the key, credits, model access, or connection is fixed.

### Offline defaults

`defaultAiderProfile` in `aider-sandbox.ts` owns these defaults:

| Setting | Default |
| --- | --- |
| Aider / Ollama | 0.86.2 / 0.40.2 |
| Model | `qwen2.5-coder:7b` |
| Inference | CPU; one request and one loaded model |
| Context / output budget | 8,192 / 2,048 tokens |
| Edit format | `diff` |
| AI phase timeout | 30 minutes |
| Startup timeout | 180 seconds |
| Agent test timeout | 60 seconds |
| Container resources | Up to 4 CPUs, 8 GB memory |

The wrapper reads Docker's CPU count and uses the smaller of that count and the profile's `cpus` limit for model, agent, and supplemental-test containers. A two-CPU Docker daemon therefore receives `--cpus 2` automatically. Evidence records both the detected count and applied limit. It stops if Docker cannot report a valid count.

These timeouts still need laptop calibration. The baseline also has its own 60-second limit.

To replace settings, copy the complete profile into JSON and set `VIBEGUARD_REPAIR_PROFILE` to its absolute path. Add `modelDigest` to pin qualified model bytes; otherwise the adapter discovers a digest once and rejects changes between phases. Replace the adapter between jobs when changing profiles, then repeat qualification.

The wrapper checks runtime versions, observed token usage, and Ollama's loaded-model report. It requires the configured context length and zero VRAM. The input token estimate uses a local tokenizer; it does not establish exact Qwen tokenization.

## Connect to the runner

Supply `createApp({ repairHarness, baselineChecks })`:

- `repairHarness.agent`: `createAiderSandbox(profile, modelOnlyDirectory)`.
- `repairHarness.principles`: the text in `harness/principles.md`.
- `repairHarness.preview`: the environment owner's startup/cleanup callback. It receives a copy of the checked version and returns a local `Preview`.
- `baselineChecks`: the verification owner's adapter. It must start and clean up fresh real PostgreSQL for each candidate run.

Keep preparation and baseline integration with their existing owners. `demo-trial-environment.ts` serves standalone qualification only.

Repair checks the current goal, original version, baseline identity, and protected suite digest. Approval rejects changed candidate or suite bytes. Job attempts remain available if preview or publication fails. Jobs share the existing in-memory single-job runner.

The ordinary server leaves repair disabled. The demo Compose configuration enables it and supplies trusted runner Docker access, the host model directory, and the existing workspace volume. The runner image includes the repair principles. Aider and supplemental tests receive individual file subpaths from that volume; diagnosis mounts them read-only, and editing enables writes only for customers.js and customers.test.mjs. Model files remain a read-only host bind mount. Direct host startup keeps individual bind mounts. Keep the socket out of agent, model, test, and verifier containers. Actual volume-file mounting and full repair remain qualification work.

## Evidence and cleanup

Each attempt stores diagnosis, edit output, before/after file diff, supplemental tests, failures, duration, source/candidate/suite digests, goal identity, tool versions, model digest, image IDs, and integration results. Read `attempt-*/evidence.json` and `diff.json`. No artifact download endpoint exists yet.

After interruption, read `database-*/environment.json` and `preview/environment.json` for the trial's Compose arguments. Use those arguments with `down -v` to remove its services and synthetic data. Agent/model names start with `vg-`; remove only this trial's containers before retrying. Abrupt process termination has no automatic recovery.

## Verification status

`pnpm check` passed with 70 tests. HTTP journeys keep import, goal/baseline gates, repair orchestration, application actions, persisted version files, and approval logic real. They fake model/process/startup and Supabase seams. Focused tests cover process timeouts, secret inheritance, requested Docker permissions, model digest changes, and cleanup failure.

The agent environment has installed Aider 0.86.2 and Ollama client 0.40.2, but no running Ollama daemon or Docker socket access. The disposable baseline returned exit 2 with inconclusive checks; the standalone command stopped at startup before inference.

Laptop trial `/tmp/vibeguard-repair-proof-7zRkK5` reproduced the lost-edit bug against real PostgreSQL. Create, read, and delete passed; update and the confirmed goal failed as expected. Both attempts then failed at Docker model startup before inference. That trial's wrapper discarded the Docker error, so it does not establish the startup failure's cause or repair quality.

Trial `/tmp/vibeguard-repair-proof-6M1ihv` retained the Docker error: the requested four CPUs exceeded the daemon's two available CPUs. Automatic CPU capping addresses that configuration error; inference and candidate verification still require another laptop run.

Trial `/tmp/vibeguard-repair-proof-jsobdp` completed its first diagnosis in 378,845 ms on four CPUs. Runtime evidence reported one inference request, an 8,192-token context, and zero VRAM, with read-only files and external-connection probes passing. The model identified the missing database update but returned nested objects where the parser requires strings. No edit or candidate check ran in that attempt. The revised prompt and progress reporting still need laptop verification.

Live isolation, PostgreSQL persistence, model repair quality, CPU runtime/memory, offline operation, and founder QA still need laptop proof. Complete two clean offline rehearsals and record their runtime, peak memory, and human QA outcome before treating the profile as qualified.

References: [Aider options](https://aider.chat/docs/config/options.html), [Aider with Ollama](https://aider.chat/docs/llms/ollama.html), [Ollama API](https://docs.ollama.com/api/generate). Use runtime version checks when documentation differs.


## Small local model diagnosis

Rebuild the harness image after changing `invoke.py`: `docker build -t vibeguard-aider:0.86.2 harness`.
Local diagnosis calls Ollama `/api/chat` directly inside the same protected container, using read-only source and the same six-field schema as cloud diagnosis: cause, evidence, affectedFiles, plan, risks, tests. Evidence and affectedFiles are arrays; the other fields are bounded strings. The model supplies all six fields; the harness does not fabricate missing fields. Cloud diagnosis enforces that schema through the trusted gateway, while edit responses remain in Aider’s edit format. Truncated responses are rejected. Aider still performs edits. CPU placement, model digest, token budgets, and independent checks remain enforced.

A diagnosis format error gets one read-only correction inside the current attempt. If correction fails, stop without spending the second repair attempt on another formatting cycle. Both replies remain in private evidence. No candidate is published without passing protected checks.

Goal chat sends the last 20 stored messages. Its prompt asks one missing fact at a time, uses earlier answers, and proposes a goal once the action and outcome are clear. Ollama retains the goal model for five minutes between turns. Local repair quality and chat behavior still need a laptop trial; mocked tests do not establish model quality.
