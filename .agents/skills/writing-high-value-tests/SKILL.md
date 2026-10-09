---
name: writing-high-value-tests
description: Audit, design, and refactor feature tests around realistic consumer behavior and critical risks while minimizing brittle or redundant low-level tests. Use when reviewing an existing test suite, planning tests for a new feature, improving weak coverage, replacing implementation-coupled unit tests, learning from strong reference tests in a repository, or consolidating many narrow tests into a small set of wide behavioral journeys across HTTP APIs, workers, events, caches, CLIs, datastores, or library boundaries.
---

# Writing High-Value Tests

## Objective

Maximize confidence per unit of test maintenance. Treat coverage as evidence, not the goal. Prefer a small number of realistic behavioral journeys that cross meaningful production layers, then retain focused tests only for important behavior those journeys cannot observe or trigger reliably.

A wide test is not necessarily a live end-to-end test. Exercise the real feature path inside the process and fake dependencies at genuine external seams such as networks, clocks, storage services, message brokers, or third-party APIs.

## Choose the Work Mode

Respect the user's requested scope:

- For an audit, inspect and recommend without editing.
- For test design, produce scenarios and a retain/replace plan.
- For implementation, add the wider coverage first, prove it passes, then prune redundant tests.
- For a new feature, design the behavioral journeys alongside the public contract before adding helper-level tests.

Do not change production behavior merely to make a test easier. If a wide test exposes a production defect, report it or fix it only when authorized.

## Workflow

### 1. Establish the baseline

Read repository instructions and identify the feature's production and test files. Use repository-native commands to:

- List existing tests and describe what each actually proves.
- Run the relevant package or module tests.
- Measure current coverage when supported.
- Record existing failures separately from changes introduced during the audit.

Do not infer test value from coverage percentage or test count alone.

### 2. Find the real consumer boundary

Trace the feature from entry point to observable result. The boundary may be:

- HTTP request to response
- Worker input to published artifact
- Event consumed to event or state emitted
- Cache miss to cache fill to subsequent hit
- CLI invocation to output and exit status
- Repository call to persisted state
- Public library call to returned value and side effects

Identify the production layers that should remain real inside the test and the dependencies that must be faked. Avoid mocking internal collaborators merely because interfaces exist.

### 3. Study strong local reference tests

Search the repository for one to three tests that already express the team's preferred style. Read the complete scenarios and their harnesses. Extract transferable patterns:

- Where they enter the system
- Which dependencies they fake
- Whether they test state transitions across multiple actions
- Which outputs, headers, artifacts, logs, or side effects they assert
- How helpers remove plumbing without hiding the behavioral story
- Which negative paths remain as focused tests

Apply the structure and reasoning, not feature-specific details.

### 4. Build a behavioral contract

Translate requirements, QA instructions, incidents, and code risks into a compact scenario matrix:

| Dimension | Questions |
|---|---|
| Consumer action | What does the client, worker, or caller do? |
| Successful result | What must be returned, published, or persisted? |
| Variants | Which locales, roles, types, modes, or configurations change behavior? |
| Structure | What schemas, URLs, fields, headers, or naming rules matter? |
| Exclusions | What must never appear or occur? |
| Lifecycle | What changes on retry, regeneration, update, cache hit, or deletion? |
| Failure safety | What must remain unpublished, unmodified, private, or retryable? |

Combine related variants as table-driven subtests inside one journey when setup and behavior are shared. Do not force a one-to-one translation of every QA bullet into a separate test.

### 5. Audit existing tests against the contract

Classify each test:

- **Primary behavioral coverage:** protects a consumer-visible journey.
- **Essential focused coverage:** protects an important invariant that is impractical or invisible at the consumer boundary.
- **Absorbable:** behavior can be represented naturally in a wider fixture or assertion.
- **Redundant:** duplicates behavior already proven at a stronger boundary.
- **Implementation-coupled:** mostly tests private helpers, call choreography, or copied implementation logic.
- **Gap:** a critical scenario has no meaningful protection.

Do not delete an implementation-coupled test until its valuable contract, if any, is identified and covered elsewhere.

### 6. Design a small set of wide journeys

Prefer scenarios shaped like real usage:

1. Arrange realistic input and external fakes.
2. Invoke the public or operational boundary.
3. Follow references or perform subsequent actions as a consumer would.
4. Parse structured output rather than relying only on substring checks.
5. Assert status and structure, content, isolation, exclusions, and meaningful side effects.

Include stateful journeys when the feature has a lifecycle. Examples include miss then hit, generate then regenerate, create then update, retry after failure, or publish then replace.

Build a harness when setup or request/response plumbing obscures the scenario. Keep test names and bodies readable as behavioral stories.

### 7. Add coverage before pruning

Implement and pass the wide journeys first. Then map every candidate deletion to an assertion or scenario that replaced it.

Absorb focused tests by enriching realistic fixtures, for example:

- Include both resolvable and unresolvable records.
- Include global and scoped exclusions and prove scope does not leak.
- Produce enough data to cross a chunk or pagination boundary.
- Exercise a lifecycle twice and verify stale state disappears.
- Parse actual output and assert namespaces, timestamps, schemas, or canonical paths.

Avoid making one huge test responsible for unrelated failure modes. Wide means crossing layers, not maximizing assertions in a single function.

### 8. Decide what focused tests must remain

Keep focused tests when they protect:

- Atomic publication or ordering invariants invisible after success
- Failure injection that cannot be reached safely through the public boundary
- Security, authorization, privacy, or destructive-action safeguards
- Validation before side effects
- External adapter semantics
- Algorithmic or combinatorial boundaries expensive to express widely
- Concurrency, timing, or retry behavior needing deterministic control
- Rare numbering, overflow, encoding, or protocol edge cases

Consolidate related focused failures into table-driven scenarios when they share setup and expected safety behavior.

### 9. Validate the refactor

Run, in order:

1. The new or changed wide tests alone
2. The affected package or module suite
3. Formatting and static checks
4. The full repository suite when feasible
5. Race, concurrency, or integration checks when relevant

Compare coverage before and after pruning. Stable coverage with stronger boundary assertions is useful evidence, but inspect the remaining uncovered branches and risks before declaring success.

### 10. Report the result

Summarize:

- The consumer journeys now protected
- The reference-test patterns adopted
- Tests removed, consolidated, and retained
- Why retained focused tests cannot be replaced cleanly by wide coverage
- Validation commands and results
- Coverage changes as supporting evidence
- Any remaining behavioral gaps

## Quality Heuristics

A high-value test usually:

- Fails when a user-visible contract or critical safety invariant breaks.
- Survives internal refactoring that preserves behavior.
- Uses production code across multiple meaningful layers.
- Fakes external seams with simple, controllable behavior.
- Asserts more than success status: content, structure, isolation, and side effects.
- Covers representative variants without duplicating setup.
- Makes failures easy to diagnose.

A low-value test often:

- Feeds an arbitrary blob through a handler and asserts it comes back unchanged.
- Mirrors a private helper line by line.
- Mocks every internal layer and proves only mock choreography.
- Exists solely to raise a coverage number.
- Repeats a wide assertion at a weaker boundary without improving diagnosis.
- Couples to exact call counts that are neither a contract nor a performance safeguard.

## Guardrails

- Do not equate fewer tests with better tests; reduce only proven redundancy.
- Do not equate wide tests with live infrastructure; keep them deterministic and fast.
- Do not hide critical variants inside opaque fixture builders.
- Do not delete negative-path tests merely because happy-path coverage is high.
- Do not use snapshots as a substitute for semantic assertions when important fields can be parsed.
- Do not chase 100% coverage at the expense of behavioral clarity.
