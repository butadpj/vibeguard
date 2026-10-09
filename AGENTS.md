# VibeGuard agent instructions

Read README.md and context/agent-workflow.md before implementation. Read PRODUCT.md for product decisions, and context/scope-and-tech-requirements.md for the five stories and demo scope. Load only additional context relevant to the task.

For API, shared model, or mock-data work, start with packages/contracts/README.md for the contract map, examples, and implementation status. Read context/backend-foundations.md for the build plan. Import shared definitions from @vibeguard/contracts and fixtures from @vibeguard/contracts/examples; do not duplicate shared definitions in app code.

For UI work, read DESIGN.md and apps/dashboard/AGENTS.md. For runner work, read apps/runner/AGENTS.md. Preserve local work. Never read or expose real credentials, .env files, imported customer data, or private project contents without task-specific authorization; use sanitized examples.

Keep changes small enough to integrate during the hackathon. Do not add frameworks, packages, or new architecture layers without a concrete need. Run pnpm check before completing code changes. Report what works, what remains simulated or incomplete, and any verification limitations.
