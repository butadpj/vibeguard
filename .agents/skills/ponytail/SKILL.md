---
name: ponytail
description: Make the smallest complete code change and design meaningful integration tests with it. Use when implementing, fixing, refactoring, or reviewing code, especially when the user asks for Ponytail, simplicity, or maintainable code with behavioral tests.
license: MIT
metadata:
  author: Dietrich Gebert
  source: https://github.com/DietrichGebert/ponytail
  source-version: "5.1.0"
---

# Ponytail

Solve the whole problem with the least necessary code. Design the code and its behavioral tests together. Prefer correctness, safety, and readable evidence over a small diff or a coverage number.

## Understand the behavior

- Trace the consumer's action from its public entry point to the observable result. Identify callers, state changes, and affected dependencies before editing.
- Reproduce the failure. Separate observed facts from hypotheses; do not invent diagnostics or claim checks you did not run.
- Define the expected result, neighboring behavior to preserve, and failure behavior before choosing the implementation.

## Make the smallest complete fix

- Fix the cause and update affected callers, tests, fixtures, and configuration.
- Reuse sound existing code, platform features, or installed dependencies before adding new machinery.
- Assume imported code may lack useful structure. Preserve good boundaries where present; introduce clear responsibilities and external interfaces where the fix needs them.
- Keep orchestration readable. Separate unrelated responsibilities when that makes the implementation clearer. Avoid a helper per function, speculative configuration, or a framework added for a small task.
- Preserve validation, authorization, error handling, and safeguards against data loss when moving code. Report success only after the required action succeeds.
- Choose clear names and straightforward control flow. Explain non-obvious constraints, not what the code already says.

## Prove behavior through integration journeys

- Enter through the public feature: an HTTP request, application action, CLI command, or rendered component interaction. Keep routing, validation, orchestration, and meaningful application logic real.
- Fake genuine external seams such as network services, model/process execution, clocks, or storage adapters. Do not mock internal collaborators just because they have interfaces.
- Use small stateful fakes that behave coherently across actions. Inject failures at the external boundary to exercise real error handling.
- Test lifecycles: create then read, edit then reload, discard then reload, failure then retry. Recreate consumer state so stale caches cannot disguise a failed save.
- Assert observable content, structured responses, persisted state, isolation, and what must remain unpublished or unchanged. Success status and mock call counts alone are weak evidence.
- Keep setup plumbing in a small harness while leaving the behavioral story visible in the test. Avoid assertions tied to private helpers or exact retry timing.
- Keep focused tests for security, concurrency, ordering, or other critical invariants that wider journeys cannot establish. Do not delete existing coverage before proving its replacement.
- Match evidence to the claim: fake persistence tests application behavior against that fake; real database persistence needs a real database integration check. In-process UI tests do not replace human end-to-end QA.

## Finish

Run the relevant checks. Review the diff for unintended behavior and unnecessary code. Report what changed, what the tests establish, and what remains unverified. Supply these instructions as context when using a harness that does not load skills itself.
