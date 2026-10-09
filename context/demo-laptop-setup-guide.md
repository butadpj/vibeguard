# Set up the demo laptop with your AI agent

This guide is for your Windows laptop with WSL Ubuntu, Ryzen 5 7535U, 32 GB RAM, and 118 GB free disk. Run the services in WSL 2 Ubuntu. Use your Windows browser to open VibeGuard.

Start with **Qwen2.5-Coder 7B**, a coding-focused model. It is different from DeepSeek R1 Distill Qwen 7B. We prioritize checked repairs and stable execution over speed.

You run commands and observe the results. Your coding agent helps inspect the laptop, install missing pieces, and diagnose failures. Run that agent in your laptop's WSL environment; an agent on a remote development machine cannot set up your laptop. Your setup agent may need internet during preparation. The eventual VibeGuard repair uses local Ollama and must work offline.

## 1. Start your setup agent

Open your local copy of this repository in WSL with your coding tool. If it lives under `/mnt/c`, ask the agent to prepare a separate Linux-filesystem checkout under `~/Projects`, preserving your current work. Use your actual repository location; the remote development path is not your laptop path.

Give the agent this prompt:

> Read `vibeguard/AGENTS.md`, `vibeguard/context/demo-laptop-setup-guide.md`, and `vibeguard/context/agent-harness-plan.md`. Help me set up this laptop one checkpoint at a time. First inspect the local environment and show which tools already work. Keep services in WSL Ubuntu, use Qwen2.5-Coder 7B with CPU inference as the baseline, and prioritize stable execution and checked fixes over speed. Preserve existing files and installations. Do not inspect credentials, `.env` files, or private imported projects. Explain commands that require sudo so I can enter the password locally. Record actual results in a local setup report; do not mark anything verified from assumptions. Do not implement product features yet.

Commands marked **PowerShell** run in Windows Terminal's PowerShell tab. Commands marked **Ubuntu** run in its Ubuntu tab. If a command fails, resolve that checkpoint before continuing with steps that depend on it.

## 2. Check WSL and memory

**PowerShell:**

```powershell
wsl --version
wsl --list --verbose
```

Checkpoint: your Ubuntu distribution shows version **2**. If it does not, ask the agent to explain the required WSL update/conversion for your installed Windows version before proceeding.

**Ubuntu:**

```sh
cat /etc/os-release
uname -m
ps -p 1 -o comm=
free -h
df -h ~
```

Checkpoint: Ubuntu, `x86_64`, usable disk space, and `systemd` as PID 1. If systemd is missing, have the agent merge this into `/etc/wsl.conf`, preserving existing sections:

```ini
[boot]
systemd=true
```

The agent should check your WSL version against [Microsoft's systemd instructions](https://learn.microsoft.com/en-us/windows/wsl/systemd).

Your Windows RAM is 32 GB, but WSL may receive less. Start with a **20 GB cap** as a provisional budget. In Windows, open `%UserProfile%\.wslconfig` and have the agent help merge this setting without replacing other entries:

```ini
[wsl2]
memory=20GB
```

This is a cap, not 20 GB reserved at startup. Save work and stop active WSL jobs before running **PowerShell**:

```powershell
wsl --shutdown
```

Reopen Ubuntu and repeat the memory/systemd checks. Adjust the cap only from measured full-stack usage. See [Microsoft's WSL configuration reference](https://learn.microsoft.com/en-us/windows/wsl/wsl-config).

## 3. Prepare the development tools

Ask your agent:

> Check Git, curl, Python with venv support, Node.js, and pnpm in this Ubuntu distribution. Reuse suitable installations. Install missing Ubuntu prerequisites and a supported Node 22 version at least 22.12, following official installation instructions. Use pnpm 10.11.0 to match the repository. Verify command paths resolve to Linux installations, not Windows executables.

For a fresh Ubuntu installation, these prerequisites are useful:

```sh
sudo apt update
sudo apt install -y ca-certificates curl git python3 python3-venv python3-pip
```

After the agent helps install Node, check:

```sh
node --version
npm --version
python3 --version
git --version
```

If pnpm is missing, install it in the chosen user-managed Node environment:

```sh
npm install -g pnpm@10.11.0
pnpm --version
```

Checkpoint: the tools work in Ubuntu, Node meets the repo requirement, and pnpm reports `10.11.0`. If Python is outside Aider's supported range, let its installer provide a compatible isolated Python rather than changing Ubuntu's system Python.

## 4. Install and configure Linux Ollama

Ask your agent to check whether Ollama and an Ollama service already exist. For a new installation, use the [official Linux installer](https://docs.ollama.com/linux). Download it to a file so you and the agent can inspect it before running:

```sh
curl -fsSL https://ollama.com/install.sh -o /tmp/vibeguard-ollama-install.sh
```

After inspection:

```sh
sh /tmp/vibeguard-ollama-install.sh
```

Have the agent merge these settings into a dedicated systemd drop-in for `ollama.service`. Do not replace unrelated service overrides:

```ini
[Service]
Environment="OLLAMA_HOST=127.0.0.1:11434"
Environment="OLLAMA_NO_CLOUD=1"
Environment="OLLAMA_MAX_LOADED_MODELS=1"
Environment="OLLAMA_NUM_PARALLEL=1"
Environment="OLLAMA_CONTEXT_LENGTH=8192"
```

Start/restart the service and verify it:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now ollama
sudo systemctl restart ollama
systemctl is-active ollama
curl -fsS http://127.0.0.1:11434/api/version
ollama --version
```

Checkpoint: the service reports `active`, the local endpoint returns a version, and service logs confirm local-only mode. A missing GPU warning is acceptable for this CPU baseline. Do not install experimental GPU drivers to complete this step. Configuration references: [Linux service settings](https://docs.ollama.com/linux), [local-only mode and concurrency](https://docs.ollama.com/faq).

## 5. Download and test Coder 7B

Keep internet on for this download:

```sh
ollama pull qwen2.5-coder:7b
ollama list
ollama show qwen2.5-coder:7b
```

The model listing reports a roughly 4.7 GB download; inference also needs context/runtime memory. Ask the agent to record the full local model digest through Ollama's model-list API, quantization, and Ollama version.

Test local generation:

```sh
curl -fsS http://127.0.0.1:11434/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"model":"qwen2.5-coder:7b","messages":[{"role":"user","content":"In two sentences, explain how to investigate an update that appears successful but does not persist in a database."}],"stream":true,"options":{"num_ctx":8192,"num_predict":512}}'
```

While it runs, use a second Ubuntu terminal:

```sh
ollama ps
free -h
```

Checkpoint: you receive generated text, Ollama stays running, and memory has headroom. Cold loading and prompt processing can take time before text appears. CPU placement is acceptable. This proves inference connectivity, not repair quality.

## 6. Install Aider in an isolated environment

Follow [Aider's installer instructions](https://aider.chat/docs/install.html) using an isolated bootstrap environment to avoid Ubuntu's system-pip restrictions:

```sh
python3 -m venv ~/.local/share/vibeguard-aider-installer
~/.local/share/vibeguard-aider-installer/bin/python -m pip install aider-install
~/.local/share/vibeguard-aider-installer/bin/aider-install
```

Follow the installer's PATH instructions, then open a new Ubuntu terminal:

```sh
command -v aider
aider --version
```

Ask the agent to verify the installed release's supported flags and prepare a **new disposable smoke-test directory**, separate from VibeGuard and private projects. Have it configure Aider's model settings there with a fixed `num_ctx: 8192`, and verify the effective setting; the Ollama server default alone does not constrain Aider's requests.

From that disposable directory, test:

```sh
export OLLAMA_API_BASE=http://127.0.0.1:11434
aider --model ollama_chat/qwen2.5-coder:7b \
  --no-git --no-auto-commits --no-auto-lint --no-auto-test \
  --no-analytics --no-check-update --no-show-release-notes \
  --message "Reply with one sentence confirming that you can receive this request. Do not edit files or execute commands."
```

Checkpoint: Aider receives a reply from local Ollama and exits. Record its version. This host-level smoke test does not provide repair isolation; actual app repairs need the protected container workflow. See [Aider with Ollama](https://aider.chat/docs/llms/ollama.html).

## 7. Prepare Docker and the dashboard

Ask the agent:

> Check `docker version`, `docker context show`, and whether a Docker daemon is already available. If Docker Desktop integration works, explain the existing setup before adding another daemon. For a full WSL-only installation, install Docker Engine and Compose from Docker's official Ubuntu repository, matching this Ubuntu release. Keep one selected engine for the demo. Do not remove existing installations or containers. Verify the daemon and a downloaded test image.

Use the [official Ubuntu installation steps](https://docs.docker.com/engine/install/ubuntu/). Run the installation in Ubuntu, with systemd available. For a fresh native Engine installation, the agent can verify with:

```sh
sudo systemctl enable --now docker
sudo docker version
sudo docker compose version
sudo docker run --rm hello-world
```

Let the agent explain how the runner will access the selected daemon; decide that before implementing environment jobs. Do not mount its socket into the repair container.

In your actual `vibeguard` folder:

```sh
pnpm install
pnpm check
docker compose up --build
```

Use a second Ubuntu terminal in the same folder:

```sh
curl -fsS http://127.0.0.1:4310/api/health
pnpm --filter @vibeguard/dashboard dev
```

If your chosen Docker Engine requires sudo, use `sudo docker compose up --build` consistently until the agent helps configure access. Open **http://localhost:5173** in your Windows browser and click **Check connection**. Keep both terminals running. Checkpoint: the dashboard reaches the Dockerized runner. This does not connect the AI yet or prove the demo app/database works.

The runner stores project files in the `runner-data` volume at `/data/vibeguard`. Use `docker compose down` to stop it while retaining that volume; do not add `--volumes`/`-v` when preserving imported projects. The backend thread owns the actual persistence test and import implementation. See the current [runner instructions](../apps/runner/README.md).

Ollama remains a WSL service outside the runner container. Installing Aider in WSL proves the tooling works, but does not install it inside the runner image. The future AI integration must provide the model connection and isolated harness execution. Current job design permits one active in-memory task, rejects concurrent work, and loses job state on restart while retaining project files.

## 8. Hand off to the real repair spike

You can complete steps 1–7 before the app and verifier are ready. The team still needs to implement their integration. Give your agent this prompt once those pieces exist:

> Read the latest contracts map, harness plan, and reliability research. Help run the protected Coder 7B qualification on this laptop. Use the agreed demo app with a real database and team-owned checks. Reproduce the failure before repair. Give Aider only an allowed candidate copy and sanitized evidence; protect originals, checks, credentials, and approval state with process/container permissions. Prove container-to-WSL Ollama connectivity without external network access. Enforce two repair attempts and record actual diffs, persisted CRUD results, peak full-stack memory, failures, and duration. Do not present an inference smoke test or mocked fixture as a verified repair. If integration is missing, report the missing implementation instead of substituting an unrestricted host repair.

Keep the default if it passes repeated repair and regression checks. If it fails, use the plan's manual profile switch; the runner profile mechanism is planned until implemented. You can download the fallback during online preparation with:

```sh
ollama pull qwen3:4b-instruct-2507-q4_K_M
```

Do not run a second model concurrently or switch during an active repair. A fallback needs its own qualification.

## 9. Rehearse offline and record the result

Download app dependencies, Docker images, and verifier browser binaries before disconnecting. Start both inference paths once to expose lazy downloads. Then save work, restart WSL/services, disconnect internet, and repeat the supported founder flow. Have the agent enforce/observe external network restrictions; Wi-Fi disconnection alone may leave another internet path.

Keep a local setup report outside exported projects with these entries:

| Item | Record |
| --- | --- |
| Environment | Windows, WSL, Ubuntu versions; effective memory cap |
| Tools | Node, pnpm, Python, Aider, Ollama, Docker versions |
| Model | Tag, full digest, quantization, context/output limits |
| Installation checks | Service readiness, inference reply, Aider reply, dashboard connection |
| Repair qualification | Actual attempts, verified repairs, regression results, crashes, peak memory |
| Offline rehearsal | Completed stages, restart behavior, export startup, retained regression check |

Pin the working versions/settings before the demo. Installation complete, AI reachable, and repair qualified are separate milestones. Do not mark the last one complete until the protected checks establish it.

## If a checkpoint fails

| Symptom | Next step |
| --- | --- |
| `systemctl` says systemd is unavailable | Check WSL version, `/etc/wsl.conf`, and whether WSL restarted |
| Ollama endpoint refuses the connection | Check `systemctl status ollama` and `journalctl -u ollama -n 80 --no-pager`; sanitize logs before sharing |
| Aider cannot find its executable | Follow installer PATH guidance and check from a new Ubuntu terminal |
| Model disappears or a process dies | Check service logs, memory, and kernel OOM records; reduce concurrent load before changing models |
| Inference runs but edits fail | Check context fit and Aider edit format; use the plan's bounded qualification workflow |
| Windows browser cannot reach the dashboard | Check Vite/runner terminals and WSL localhost forwarding before exposing any service on the LAN |

Give your agent the failed command, sanitized output, and the last successful checkpoint. Ask it to explain the cause and apply the smallest correction. Avoid repeating the whole installation.
