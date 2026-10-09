# Local AI options and reliability

Research date: 2026-10-09. Target: Windows/WSL Ubuntu, Ryzen 5 7535U, 32 GB RAM, 118 GB free disk. No laptop measurements yet.

The owner wants VibeGuard to investigate issues and deliver checked fixes that founders can trust. Speed is secondary. Select for investigation quality, correct edits, regression protection, and stable execution. A model that completes inference but damages another CRUD action does not qualify.

## Distillation and quantization

Distillation trains a smaller model using supervision from a larger model. We can download an existing distilled model; we do not need to run its teacher or perform training on this laptop. DeepSeek publishes R1-distilled checkpoints from 1.5B upward, trained using generated reasoning examples. Their code benchmarks do not establish reliable app repair through our harness. See the [DeepSeek model card](https://huggingface.co/deepseek-ai/DeepSeek-R1).

Quantization stores model weights at lower precision to reduce their memory footprint. It applies to ordinary and distilled models. [llama.cpp](https://github.com/ggml-org/llama.cpp) supports CPU inference and several integer precisions. Distillation and quantization can reduce resource requirements; neither guarantees correct fixes or freedom from runtime failure. Compare actual artifacts, context use, and observed repairs.

Do not train/distill a custom model during this hackathon. We lack the training dataset and evaluation evidence to justify that work. Use existing downloadable models and a constrained repair workflow.

## Candidates

| Candidate | Evidence | Decision |
| --- | --- | --- |
| Qwen2.5-Coder 7B Q4_K_M | Coding-focused; [Ollama listing](https://ollama.com/library/qwen2.5-coder:7b) reports 4.7 GB | Keep as comparison baseline; slower execution is acceptable |
| Qwen3 4B Instruct 2507 Q4_K_M | [Exact Ollama tag](https://ollama.com/library/qwen3:4b-instruct-2507-q4_K_M) reports 2.5 GB | First lighter challenger; measure edit and diagnosis quality |
| Qwen3.5 4B | [Ollama listing](https://ollama.com/library/qwen3.5:4b) reports approximately 4.0 GB total, including a 3.3 GB Q4_K_M model component | Newer small challenger; pin compatible runtime and validate text-only harness behavior |
| Qwen2.5-Coder 3B | [Listing](https://ollama.com/library/qwen2.5-coder:3b) reports 1.9 GB | Resource fallback; reject if its checked repairs are weaker |
| DeepSeek R1 Distill Qwen 7B / 1.5B | Existing distilled reasoning checkpoints; creator reports separate size-specific evaluations | Secondary experiment if reasoning is the observed bottleneck; long reasoning and edit compliance need qualification |

Download size is not peak memory. These are available candidates, not a measured ranking on our app. Qwen3.5's creators recommend long context for complex reasoning and provide thinking/non-thinking modes; our small context proposal must earn its own repair results. We cannot transfer its published benchmark scores to an 8K quantized Aider configuration. See the [Qwen3.5 model card](https://huggingface.co/Qwen/Qwen3.5-4B).

Given the owner's limited experiment time, qualify 7B Coder first and freeze it if it passes. Keep 4B Instruct behind a switchable runner profile; compare alternatives only if observed failures justify it. Qwen3.5 4B remains a later option. Retain a configuration with verified results and enough memory headroom. The 32 GB laptop makes this a plausible CPU experiment; only measured full-stack runs can establish fit. Coder 7B and R1 Distill Qwen 7B are different models; distillation alone does not establish which repairs better.

## Existing execution solutions

| Solution | What it provides | Fit for VibeGuard |
| --- | --- | --- |
| Aider + Ollama | Existing local-model code editing | First choice for bounded edits; runner owns jobs, isolation, and checks |
| OpenCode + Ollama | Existing local-provider agent workflow | Fallback if investigation/tool orchestration proves inadequate; qualify tool calls and resource use before changing harness |
| Aider + llama.cpp server | Direct CPU/GGUF inference behind a compatible API | Runtime alternative if an identified Ollama problem blocks the demo; extra configuration to own |

Changing the harness does not remove the model's memory requirements. [OpenCode documents Ollama support](https://opencode.ai/docs/providers/#ollama) and suggests increasing context when tool calls fail. This can increase memory pressure. Prefer the smallest workflow that can investigate the supported app, rather than adopting a larger agent system without evidence.

[Aider documents edit-format failures](https://aider.chat/docs/troubleshooting/edit-errors.html), recommends limiting irrelevant files, and offers `--edit-format whole` as an alternative. Test whole-file edits for short files if diff application fails. Whole-file output needs more generated tokens and can overwrite unrelated changes, so compare diffs and rerun regression checks. Architect mode adds a planning/editing sequence; evaluate only after a concrete failure, with one model loaded at a time.

## Reliable investigation and acceptance

Have the runner provide the confirmed goal and observed failure. Have the harness identify relevant source and explain a hypothesis before editing. Preserve that investigation record; do not prefill the fix or use a replay as evidence of fresh AI work. Focus prompts and file access on relevant code while allowing a bounded request for additional context. A small model needs sufficient evidence, not an entire repository dump.

Require protected, team-owned checks to reproduce the initial failure and check all CRUD actions and persisted database state afterward. Add neighboring cases appropriate to the bug: for an update bug, check another record remains unchanged and the edit survives reload. Check empty/invalid input where it affects the intended journey. Do not let the repair agent weaken acceptance tests. Use developer review of qualification diffs to catch unintended scope changes before freezing the demo configuration.

The founder sees observed evidence, the proposed change, and remaining uncertainty. Say “no verified fix is ready” when attempts fail. Say “could not check” when the verifier cannot run. Do not present a model's confident explanation as proof. Passing the retained checks supports the agreed journey; it cannot prove absence of other bugs.

## Stable execution

Run CPU inference first; avoid depending on an unproved WSL GPU path. Fix model digest, Ollama/Aider versions, context settings, and sampling after qualification. Load one model and serialize inference, including chat during repair. Bound chat history, relevant files, output, and diagnostics; check prompt fit before submission. [Ollama's FAQ](https://docs.ollama.com/faq) documents concurrency-related memory growth and local-only mode.

Measure Linux/WSL and Windows memory during the full stack, including builds and browser checks. Use a provisional acceptance margin of 25% below WSL's memory cap at observed peak; inspect sustained swap activity and OOM records. This is a project criterion, not a guaranteed memory formula. Stop unnecessary baseline services during repair when previews can restart afterward, and cap container resources so an app build cannot starve inference.

Calibrate a generous finite watchdog from slow CPU trials. Do not kill productive inference to meet the old speed targets. Test prompt-processing delays and model loading as well as generation. Record safe checkpoints at job creation, attempt start, and frozen candidate creation. A service crash can restart the service, but cannot silently resume a partially applied edit or approve it. Preserve the source, invalidate the partial candidate, report the failure, and require a new bounded run.

## Qualification before commitment

1. Qualify Coder 7B first. If it fails, compare the fallback on identical source, goals, protected checks, and full-stack conditions. Reset copies, database state, and conversation between trials.
2. Run five primary-bug trials for the candidate being qualified, plus neighboring regression cases and a missing-dependency/inconclusive case. Track diagnosis quality, valid edits, verified repairs within two attempts, introduced regressions, crashes/OOMs, peak memory, and duration.
3. Require no crashes and no false success reports in the qualification batch. Record failed repairs as failures; do not hide them with extra attempts. Include cancellation and a controlled service interruption to prove containment/recovery rather than uninterrupted success.
4. Choose the strongest repair record among configurations with measured memory headroom. Use time for presentation planning, not as the primary quality gate. Freeze settings and run two offline rehearsals, including export startup and catching a reintroduced regression.

These trials establish evidence for the supported demo, not a statistical reliability guarantee for arbitrary founder projects. No solution here has passed this qualification yet.
