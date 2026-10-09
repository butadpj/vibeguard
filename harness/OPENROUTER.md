# Fast harness debugging with OpenRouter

Use this to check the repair flow without waiting for CPU inference. It runs the same bounded attempts, diff review, regression tests, and fresh PostgreSQL checks. This mode sends the supplied source files and repair evidence to OpenRouter, uses paid API credits, and requires internet access. It does not qualify the offline Qwen setup.

Run these commands from `vibeguard/`, after the current trial exits. The demo images and project dependencies must already be prepared as described in [the trial guide](README.md).

## 1. Rebuild the wrapper

```sh
docker build -t vibeguard-aider:0.86.2 harness
```

You only need to rebuild again when the files in `harness/` change.

## 2. Set your key

This prompt hides the key and keeps it out of shell history. Paste it into your terminal, never into chat:

```sh
read -rsp "OpenRouter API key: " OPENROUTER_API_KEY
echo
export OPENROUTER_API_KEY
```

The key belongs only to the trusted gateway. Aider receives a placeholder key and has no direct internet access.

## 3. Run the cloud trial

Use the cloud defaults for this first run:

```sh
unset VIBEGUARD_REPAIR_PROFILE
node --import ./apps/runner/node_modules/tsx/dist/loader.mjs apps/runner/src/features/repairs/repair-standalone.ts . --openrouter
```

The terminal should print `Cloud debug trial: OpenRouter / anthropic/claude-sonnet-5.5`. Each diagnosis or edit call has a five-minute maximum; actual latency still needs measurement. The default uses low reasoning effort. See [the model's OpenRouter page](https://openrouter.ai/anthropic/claude-sonnet-5.5).

On success, open the printed preview URL. Edit a customer, save, and refresh to confirm the edit remains; also try creating and deleting a customer. Use the printed cleanup command when finished. On failure, share the final error and `Trial evidence:` path.

If a repair already passed and you only need to reopen its preview, use [Reopen an already checked fix](README.md#reopen-an-already-checked-fix). It makes no AI requests.

## Change the model

Set an exact model ID from [OpenRouter's catalog](https://openrouter.ai/models), then run the same command. For example:

```sh
export VIBEGUARD_CLOUD_MODEL="anthropic/claude-sonnet-4.6"
```

To return to the default cloud model:

```sh
unset VIBEGUARD_CLOUD_MODEL
```

To return to offline Ollama, omit `--openrouter` and set `VIBEGUARD_MODELS_DIRECTORY` as in the trial guide. Offline mode never receives the OpenRouter key.

## Use cloud repair from the dashboard

Keep dashboard AI settings in vibeguard/.env. For a new checkout, copy example.env to .env once; do not overwrite an existing .env. Set VIBEGUARD_REPAIR_PROVIDER=openrouter, VIBEGUARD_CLOUD_MODEL to your selected model ID, and OPENROUTER_API_KEY to your key. The example lists all local and cloud options. Clear older shell exports of these variables because shell values override .env. Rebuild the connected backend:

```sh
docker compose -f compose.yaml -f compose.demo.yaml up --build -d
```

Edit VIBEGUARD_CLOUD_MODEL in .env to choose another cloud model. The runner logs its selected repair provider and model at startup. The key goes only to the trusted runner/gateway; Aider still receives a placeholder. Step 2 uses VIBEGUARD_GOAL_PROVIDER=openrouter or ollama independently. Optional VIBEGUARD_GOAL_CLOUD_MODEL overrides the shared cloud model. Cloud chat sends conversation messages and the current goal to OpenRouter, using the same API key.

To switch Step 4 back to local Qwen, set VIBEGUARD_REPAIR_PROVIDER=ollama in .env. VIBEGUARD_LOCAL_MODEL selects the downloaded repair model and VIBEGUARD_MODELS_DIRECTORY points to the host model-only folder. No cloud key is needed in local mode. Restart:

```sh
docker compose -f compose.yaml -f compose.demo.yaml up -d
```

Refresh your project, prepare its test app again, then rerun baseline checks before repair. Model/provider changes take effect when the runner restarts, between jobs. Cloud failures never switch providers automatically. Custom repair JSON profiles remain available for direct host startup; their provider must match any explicit provider selection.
