# Shared workflow

## Authority

PRODUCT.md and agreed requirements establish intent. DESIGN.md establishes visual authority; design-tokens contains executable values. Code and observed checks establish implemented behavior. Design guidance describes intended UI behavior. Only observed checks establish that a repair works. Explicit team decisions supersede old documents; update their owning source in the same change.

## Starting a task

Read the root README and relevant context. Inspect affected code and scoped instructions. Identify the story, expected behavior, contract changes, and dependencies before implementation. Use the local working tree for development; do not fetch or switch branches merely to start work. For claims about merged or deployed behavior, verify that specific revision or deployment and label local changes separately.

## Contributing

Use small feature branches and PRs. Coordinate shared contract changes before dependents implement them. Put interface changes and their consumers in the same PR where practical. State what changed, how it was checked, and what is incomplete. Update product, architecture, or design context when an established decision changes; record unresolved decisions in gaps.md. Do not copy policy across tool-specific files.

## Proof

Run pnpm check. Add behavioral tests for meaningful product risks as features arrive, especially setup gates, approval identity, offline operation, data persistence, and protected checks. A health response only proves the runner connection. Never imply it proves app setup, model readiness, or a verified fix.
