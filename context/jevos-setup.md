# Prepare the local decision model

VibeGuard can use **jevos-v4** to choose its next clarification question. Qwen still writes the goal and handles repairs. Jevos is an independent open-source alternative to TypeSafe Jev; this integration makes no Jev cloud calls.

The runtime uses CPU inference. Start with two threads on the Ryzen laptop so it leaves room for Qwen and the test app. Budget roughly 2 GB of extra free RAM. Upstream reports about 1–1.4 GB in use; speed and accuracy on this Ryzen have not been measured.

## Docker setup (Windows or Linux)

Run these commands from `vibeguard` while internet is available. Python 3.9+ and Docker Compose are required. On Windows, use `python` instead of `python3` if needed.

```sh
python3 scripts/prepare-jevos.py --platform linux
docker pull node:22-bookworm-slim
docker compose -f compose.yaml -f compose.demo.yaml -f compose.jevos.yaml up --build -d
```

The preparation script downloads about 660 MB, checks the release's pinned SHA-256 hashes, and installs under `.vibeguard/jevos/jev`. Allow roughly 2 GB of free disk space during extraction. It leaves an existing installation alone. Keep the binary, libraries, model, and downloaded Docker images for offline use.

The overlay sets `VIBEGUARD_JEVOS_URL=http://jevos:8017` and forces both goal conversation and repair to use local Ollama. Prepare Qwen and the repair/runtime Docker images using the existing [laptop guide](demo-laptop-setup-guide.md) too. Jevos listens inside its container, has no published host port, and uses an internal Docker network without internet access. The model files are read-only. No API key is needed on this private connection. Omit this overlay when deliberately testing cloud providers.

Check readiness:

```sh
docker compose -f compose.yaml -f compose.demo.yaml -f compose.jevos.yaml exec runner node -e "fetch('http://jevos:8017/health').then(r=>r.json()).then(console.log)"
```

Expect `status: 'ready'` and `model: 'jevos-v4'`. Readiness proves the model loaded; it does not prove a decision or repair is correct. Disconnect Wi-Fi, restart the prepared services, and try a goal conversation before the demo. Use the same three Compose files when restarting or stopping this setup.

## Direct host setup

For a directly running runner, download the native runtime:

```sh
python3 scripts/prepare-jevos.py --platform linux
./.vibeguard/jevos/jev/jev serve --host 127.0.0.1 --port 8017 --threads 2 --warmup 0 --state-cache 4 --state-cache-tokens 2048
```

Linux needs x64 and glibc 2.35+ (for example Ubuntu 22.04+). On Windows x64, prepare with `--platform windows`, then run:

```powershell
.\.vibeguard\jevos\jev\jev.exe serve --host 127.0.0.1 --port 8017 --threads 2 --warmup 0 --state-cache 4 --state-cache-tokens 2048
```

Set `VIBEGUARD_JEVOS_URL=http://127.0.0.1:8017`, `VIBEGUARD_GOAL_PROVIDER=ollama`, and `VIBEGUARD_REPAIR_PROVIDER=ollama` in the runner's environment, then restart it with your usual local demo command. Leave the model terminal open. Use loopback; a host service bound to loopback is not directly reachable from the ordinary Docker runner. Choose the Docker overlay for that setup.

## If setup or conversation fails

- A download/checksum failure installs nothing. Check your internet connection and rerun preparation. Do not bypass the hash check.
- If the preparation directory already exists, reuse it. To change runtime platforms, move it aside and prepare a fresh copy; Windows binaries cannot run in the Linux container.
- For an unhealthy Docker service, run `docker compose -f compose.yaml -f compose.demo.yaml -f compose.jevos.yaml logs jevos`. A missing `/opt/jevos/jev` usually means preparation was skipped or used the Windows binary.
- `GET /health` can take time during the first model load. Basic inference warmup finishes before readiness. The additional idle warmup is disabled to leave CPU time for Qwen; the overlay allows startup time before treating it as failed.
- The runner falls back to its existing Qwen conversation if Jevos times out, returns an invalid/uncertain decision, or the conversation is too long. Check the runner logs and compare how many Qwen calls are actually skipped.

The initial confidence cutoff and timeout are conservative starting values, not calibrated measurements. Test clear messages, vague messages, and follow-up answers on the actual laptop. Jevos can still choose the wrong question. It cannot approve a goal or fix, bypass protected tests, or replace human approval.

## Integration notes

The adapter sends one `choice` question to `POST /v1/systemone`, with criteria `missing_action`, `missing_actual`, `missing_expected`, and `ready`. The response is shaped as:

```json
{
  "model": "jevos-v4",
  "answers": {
    "next_action": {
      "type": "choice",
      "choice": "missing_actual",
      "probabilities": { "missing_action": 0.01, "missing_actual": 0.97, "missing_expected": 0.01, "ready": 0.01 },
      "confidence": 0.96
    }
  },
  "usage": { "input_tokens": 120, "output_tokens": 0 }
}
```

Those numbers are an illustrative response, not a measured prediction. Confidence is the winning probability normalized above the uniform baseline; with four choices, `(winning_probability - 0.25) / 0.75`. It is not a guarantee of correctness. The adapter validates the decision before using a fixed clarification question; `ready` still goes to Qwen to draft the goal.

Source: [pinned jevos-v4 release](https://github.com/feder-cr/jev/releases/tag/jevos-v4), [API implementation at that release](https://github.com/feder-cr/jev/blob/jevos-v4/src/server.cpp). The published benchmark used an Intel laptop, so it does not establish Ryzen performance.
