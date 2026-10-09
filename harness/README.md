# Run the repair trial on your laptop

This trial tries to fix the customer tracker's lost-edit bug in a disposable copy. It checks the result, then gives you a browser link to try the fix.

For faster debugging with your OpenRouter key, use [the cloud trial guide](OPENROUTER.md). The steps below are for offline CPU inference.

Use a Linux or WSL terminal. Start Docker first. You need Node 22.12 or newer. Run the commands below from the `vibeguard/` folder.

## 1. Prepare while online

Download the trial's Docker images and project dependencies:

```sh
pnpm install
docker build -t vibeguard-aider:0.86.2 harness
docker pull ollama/ollama:0.40.2
docker pull node:22.14.0-bookworm-slim
docker compose -f fixtures/demo-crud/customer-tracker/compose.yaml pull
```

The Compose command downloads PostgreSQL, PostgREST (the database API), and Nginx (the web server) for the customer tracker. It does not start them or install Ollama on Ubuntu.

Check whether your existing Ubuntu Ollama already has the model:

```sh
ollama list
```

If `qwen2.5-coder:7b` is missing, download it:

```sh
ollama pull qwen2.5-coder:7b
```

This command uses your Ubuntu Ollama. During the trial, the Docker Ollama reads those downloaded model files through a read-only folder mount. You download the model once and reuse it in Docker.

If a command fails, stop there and share the error before continuing.

## 2. Set the model folder

This is the **only required environment variable**. For Ubuntu's standard Ollama service installation:

```sh
export VIBEGUARD_MODELS_DIRECTORY="/usr/share/ollama/.ollama/models"
ls "$VIBEGUARD_MODELS_DIRECTORY"
```

You should see `blobs` and `manifests`. If you run Ollama under your own user account, the folder may be `$HOME/.ollama/models`. If you configured `OLLAMA_MODELS` for your server, use that folder. Set this variable again when you open a new terminal. See [Ollama's model locations](https://docs.ollama.com/faq#where-are-models-stored).

If Ubuntu reports `Permission denied` for the standard service folder, grant your user read access. These commands keep Ollama's ownership and write permissions:

```sh
sudo apt-get install acl
sudo setfacl -m "u:$(id -un):--x" /usr/share/ollama /usr/share/ollama/.ollama
sudo setfacl -R -P -m "u:$(id -un):rX" /usr/share/ollama/.ollama/models
ls "$VIBEGUARD_MODELS_DIRECTORY"
```

The final command should show `blobs` and `manifests`. [Permission command reference](https://man7.org/linux/man-pages/man1/setfacl.1.html).

You do not need API keys or real Supabase credentials. The trial sets CPU inference and the 8,192-token context for you.

## 3. Run offline

Close other AI tools and stop any Ollama server you started outside this trial to free memory. Disconnect from the internet, then run:

```sh
node --import ./apps/runner/node_modules/tsx/dist/loader.mjs apps/runner/src/features/repairs/repair-standalone.ts .
```

Keep the terminal open. Each AI step can take up to 30 minutes on the CPU.

The trial checks the broken app first, tries up to two fixes, and checks each fix against a new local database.

If an attempt fails, the terminal prints its reason and elapsed time before starting another attempt. Detailed evidence stays in the printed trial folder.

## 4. Try the result

On success, the terminal prints a preview link, usually **http://127.0.0.1:4410**. Open it and:

1. Create a customer.
2. Edit their name and email, then save.
3. Refresh and reload the page. Check that your edits remain.
4. Delete that customer. Check that another customer remains unchanged.

When you finish, run the cleanup command printed in the terminal. It stops this preview and removes its test data.

If the trial fails or you interrupt it, share the final error and the `Trial evidence:` path. Keep that folder for debugging.

### Reopen an already checked fix

If repair passed but you need a new preview, keep its trial evidence folder. Run the old preview's printed cleanup command first, then replace the example path below with your trial folder:

```sh
node --import ./apps/runner/node_modules/tsx/dist/loader.mjs apps/runner/src/features/repairs/repair-preview.ts . /tmp/vibeguard-repair-proof-EXAMPLE
```

This starts a new preview and new test database without calling AI. No API key or model folder is required. It refuses changed candidate files or changed protected checks. Open the new printed URL, then use its cleanup command when done.

## Optional settings

Leave these unset for the first run.

| Variable | Use it when |
| --- | --- |
| `VIBEGUARD_TRIAL_PORT` | Port 4410 is busy. Set another port, such as `4411`. |
| `VIBEGUARD_REPAIR_PROFILE` | An engineer gives you a settings JSON file. Set its full path. |

A cloud trial has repaired the fixture and passed real PostgreSQL checks on the demo laptop. Browser QA and a passing offline CPU trial remain pending. Connecting it to the running VibeGuard API also needs the app startup, verification, and preview adapters.

[Implementation and integration notes for engineers](ENGINEERING.md).
