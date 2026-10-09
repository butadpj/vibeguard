# Epic: VibeGuard helps me investigate and fix my app locally

## Problem

A founder has shipped an AI-built app. Features get slower and bugs return after fixes. They need evidence before accepting another change.

## Product Goal

Investigate a prepared project, verify a fix, and keep checking later changes without internet.

## Primary Users

Nontechnical founders with a project folder or ZIP. GitHub is optional.

## Product Behavior

**Open project → Agree on a goal → See the problem → Try the fix → Approve and keep checking**

Use internet for setup downloads: tools, model, Docker images, and app dependencies. Run investigation and repair locally afterward. V1 uses text.

**Demo scope:** one simple CRUD app that creates, views, edits, and deletes records in a real local database. No cloud authentication, payments, email, or founder-platform services in its runtime.

**Setup gate:** the app and database must run independently of the founder’s platform. If we cannot prepare that environment, show **Setup incomplete**. We cannot claim a verified fix without reproducing and checking the issue.

## User Stories

| Story | Category | Design & Requirements |
| :---- | :---- | :---- |
| **US1:** As a founder, I want to open my project so VibeGuard can check a separate copy. | Prepare my app | Choose a folder or ZIP. Support one agreed app setup. Guide downloads, then prepare a local test app with separate data and a link opening in a new tab. Show **Ready** only when the app and database run without the founder’s platform. Otherwise show **Setup incomplete** or **Unsupported setup**, with a next step. No terminal commands in the supported founder flow. |
| **US2:** As a founder, I want to explain what should happen so VibeGuard investigates the right problem. | Agree on the goal | Use local-AI text conversation. Ask for missing details. Show an editable goal and ask the founder to confirm it. For speed issues, agree on the action and acceptable time. Goal confirmation does not approve a fix. |
| **US3:** As a founder, I want to see evidence so I understand what needs fixing. | Check before changing | Check the local app before editing code. Show **Passed**, **Failed**, or **Could not check**, with evidence and a short explanation. Show timings for speed goals. Explain missing dependencies or services. Observe real saved data; mocked services do not prove independence. |
| **US4:** As a founder, I want to try a checked fix so I can decide whether to use it. | Investigate and repair | Local AI and an existing harness edit the test copy. Allow two repair attempts. Run the same protected checks on a fresh copy afterward. Show the change, before/after evidence, and fixed test-app link when required checks pass. Say when no verified fix is ready. |
| **US5:** As a founder, I want to approve the fix and keep its check so I can catch the problem returning. | Save and keep checking | **Approve fix** saves the exact checked code, service setup, run instructions, and checks as a separate folder or ZIP. Leave the original unchanged. Store the goal, checks, and results locally. Run those checks on later local versions. Sharing and publishing remain separate. |

## Proposed Plan

First prove one real offline repair on the demo laptop. Use the simple CRUD scope. Choose its stack and local model from that result.

### Four engineers

| Engineer | Owns |
| --- | --- |
| 1 | Project picker, conversation, goal, evidence, preview, approval UI |
| 2 | Local runner, Ollama/harness integration, job state, approval, export |
| 3 | Docker setup, downloads, app copies, test data, local preview URLs |
| 4 | Protected checks, failure evidence, measurements, regression proof |

### Build rules

- **Offline:** Prepare dependencies online. Required tools make no internet requests during investigation. Explain when a repair needs another download.
- **Harness:** Try Aider with Ollama. Reuse a harness; test the model on the chosen laptop.
- **Proof:** Keep checks outside the repair agent’s control. Reproduce the bug before repairing it. Check the real database and all four CRUD actions before approving the fix. Compare speed under the same conditions if measuring performance.
- **Approval:** Record original and fixed versions. Changed code requires new checks; changed goals also require confirmation.
- **Status:** Separate **Fix checked**, **Saved locally**, **Shared to GitHub**, and **Live app checked**. Checks report failures; they do not block publishing.

Share project/job ID, confirmed goal, code versions, status, preview URL, evidence, and approved export. Engineer 2 connects the steps; Engineer 4 owns proof. Reserve the final hours for integration and two offline rehearsals.

## Success Criteria

After setup, disconnect Wi-Fi and restart VibeGuard. Complete all five stories without code reading or terminal commands. Show fresh AI output, a real CRUD failure, a verified fix, and the saved check catching the problem after another local change. Start the exported project with its included setup and instructions, without the founder’s platform.

## Non-Goals

Arbitrary app setups, fresh offline setup with missing dependencies, cloud AI or sandboxes in the investigation loop, required voice or GitHub, replacing complex platform services, live-data changes, and publishing. One passing goal does not prove the whole app is safe.

Related: [System design](?tab=t.wbol5ygqvuyh) · [Product overview](?tab=t.0) · [Product notes](?tab=t.2wtpct2e2qaq).

Development exception: opt-in cloud goal conversation and repair are available for integration testing. These modes require internet and paid credits; the offline success criteria still require Ollama.
