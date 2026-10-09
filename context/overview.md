# VibeGuard

VibeGuard helps nontechnical founders investigate slow features and recurring bugs in apps they have shipped. It runs on their computer and keeps working without internet after project setup.

## The problem

You built and sold an app with AI. Now it’s slow, bugs keep returning, and another fix might break something customers use.

Our team faced this: engineers had to clone an AI-built product and investigate its performance issues and bugs. We still need to test demand with other founders.

## The flow

**Open project → Confirm the goal → See evidence → Try a checked fix → Approve and keep checking**

Choose a folder or ZIP. VibeGuard prepares a separate local test app. Explain what should work, see the evidence, and try the fix in a new tab. Approval saves a separate fixed copy and keeps the check for later changes. The founder gets the code, service setup, run instructions, and checks so they can maintain the app and choose where to deploy it.

## Internet and offline work

| Stage | Internet |
| --- | --- |
| Download tools, model, Docker images, and project dependencies | Allowed during setup |
| Investigate, repair, and verify a prepared project | Not required |
| Share through GitHub or publish | Required; outside the offline flow |

Local execution gives us control of the test app and data. Local AI keeps investigation available without sending code to a model provider. It does not guarantee a better diagnosis.

## The judge’s question

**“Why wouldn’t I use my app builder?”**

> Keep using your builder. VibeGuard helps you reproduce problems, measure them, verify a focused fix, and keep a check for later changes. After setup, that work continues without internet.

VibeGuard also helps founders leave with a runnable project they can take to another hosting provider. Local verification does not prove a new live deployment works.

The repair agent cannot edit its own approval checks. If a builder provides this whole experience, the founder may not need us.

## The 24-hour proof

Use a simple CRUD app: create, view, edit, and delete records in a real local database. Use one supported stack and text conversation. Prepare it online, disconnect Wi-Fi, and restart VibeGuard. Show a fresh investigation, a failed check, a verified fix, and the saved check catching the problem again. For a speed issue, compare timings under the same conditions.

**Setup must pass first:** the app and database must run without the founder’s platform. If we cannot prepare that environment, show **Setup incomplete** and do not claim a verified fix. Mocked services do not prove independence.

First prove the local model can handle this CRUD project on the demo laptop.

Related: [Five stories and build plan](scope-and-tech-requirements.md) · [System design](system-design.md) · [Notes](notes.md).
