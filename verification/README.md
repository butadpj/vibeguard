# Verification

Put the checks that reproduce a bug and verify its fix here. We haven't implemented them yet.

Run the same protected high-level integration checks before and after a repair. Exercise public application actions or interfaces across meaningful production layers. For the demo, check that the app creates, reads, updates, and deletes records in a real local database, including persistence and neighboring regressions relevant to the reported bug. Save version-bound evidence for the dashboard to show.

For deterministic runner tests, fake external model/process boundaries while keeping routes, orchestration, workspace storage, and result handling real. For application tests, substitute external dependencies only where needed; a fake database cannot prove the demo's persisted-data behavior. Follow the [writing-high-value-tests skill](../../.agents/skills/writing-high-value-tests/SKILL.md).

V1 end-to-end testing is performed by the founder in the candidate app preview after integration checks pass. Automated browser end-to-end tests are not required. “Fix checked” describes the automated results, not completed human QA or approval. Approval references the same checked version the founder tries.

The repair agent must not be able to edit these checks. Enforce that when the runner starts the repair process, using file permissions or container mounts.

The agent may add regression tests inside its candidate project. Those tests supplement the protected acceptance suite; they cannot replace or weaken it, or establish acceptance on their own.

Coordinate with whoever builds the runner and [demo app](../fixtures/demo-crud/README.md). Read [the requirements](../context/scope-and-tech-requirements.md) before adding checks.
