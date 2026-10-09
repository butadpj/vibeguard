# VibeGuard

<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
Nontechnical founders with a local project folder or ZIP whose shipped apps have slow features or recurring bugs.

## Product Purpose
Investigate a prepared project locally, show evidence, prepare checked fixes, and retain checks for later local changes. Keep this work available without internet after setup.

## Capabilities and Constraints
Five stages: open a project, agree on a goal, check, try a fix, approve and keep checking. Preparation may download tools and dependencies. Investigation, AI inference, repair, and verification run offline after setup. V1 uses text; GitHub is optional.

Confirming a goal is separate from approving a fix. The repair agent cannot change its own acceptance checks. Approval saves a separate checked project copy with code, service setup, run instructions, and retained checks. The founder can maintain it and choose where to deploy it; sharing and publishing remain separate actions.

V1 demo scope is one simple CRUD app with a real local database. Setup must run the app and database independently of the founder’s platform. If it cannot, show Setup incomplete and do not claim a verified fix. Exclude cloud authentication, payments, and email. Check real persisted data and all four CRUD actions before approving the fix.

Founders open test copies through links in a new tab. The original and repaired copies have separate test data.

V1 automated verification uses high-level integration tests across application behavior and real local database state. The founder performs end-to-end testing in the candidate app preview before deciding whether to approve. “Fix checked” means the required integration checks passed for that version; it does not mean human QA or approval is complete.

## Stack
Accepted team-repo starting point: React + Vite + TypeScript dashboard and a long-running Node.js + TypeScript local runner in a pnpm monorepo. The runner serves the built dashboard and API together. Founder installation will package both; installer format is undecided.

Planned integrations: browser dashboard + local runner, Docker test app, Ollama with a downloaded model, existing coding harness (candidate: Aider), and independent checks. The CRUD app stack and local model remain undecided until a real offline repair succeeds on the demo laptop.

## Evidence on Hand
The current implementation supports project import/preparation, goal conversation and confirmation, baseline evidence, bounded harness repair, matching candidate previews, exact-version approval, runnable export, and retained checks. The connected repair flow uses the direct host runner. A cloud debug harness trial has passed real PostgreSQL checks; full offline qualification and founder QA remain pending. See context/architecture.md for implementation status.

## Product Principles
Prioritize correct investigation, checked fixes, and stable execution over speed. A slower repair is acceptable. Show when no verified fix is ready; do not treat AI confidence or completed execution as proof.

Use familiar words. Show proof rather than reassurance. Keep the founder in control of approval. Make the five stories easy to follow.

Developer testing supports opt-in OpenRouter for goal conversation and repair. It sends conversation/goal text online and uses paid credits; select Ollama for the offline product flow.
