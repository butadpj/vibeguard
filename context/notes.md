# VibeGuard notes

## Current direction: local investigation after project setup

Updated 9 October 2026. V1 demo scope: a simple CRUD app with a real local database. This direction replaces the earlier GitHub-first onboarding and cloud voice/repair plan below.

The challenge asks for an AI product that remains useful without internet. VibeGuard helps founders whose shipped apps have become slow or unreliable. Our team has faced this: engineers cloned an AI-built product and investigated its performance issues and bugs.

The senior approach remains: reproduce the problem, find the cause, make a focused change, prove the result, and keep a check for later changes.

**Open project → Confirm the goal → Check → Try a fix → Approve and keep checking**

- Choose a project folder or ZIP; GitHub is optional.
- Use internet during preparation to download the tools, local model, Docker images, and project dependencies.
- Run the AI, test app, repair harness, and checks locally after setup. V1 uses text.
- Keep original files and customer data separate from test copies. Protect checks from the coding agent.
- Save approved code, service setup, run instructions, and checks as a separate project copy. The founder can maintain it and choose another deployment later.

Local execution gives us control of the app and test data. Offline AI keeps that investigation available without cloud services. We still need a runnable supported project and enough test data to reproduce the issue. For the demo, the app and database must run without the founder’s platform. Show **Setup incomplete** if we cannot prepare that environment. Reproduce the problem before claiming a verified repair; mocked dependencies cannot prove platform independence.

For 24 hours: one supported CRUD setup (create, view, edit, delete records), one failing journey, and an existing local-model-compatible harness. Exclude cloud authentication, payments, and email. Check the real database and the four CRUD actions after the fix. First prove a real repair on the demo laptop with Wi-Fi off. The model and app stack remain open until that experiment.

Current plan: [Overview](overview.md) · [Five stories](scope-and-tech-requirements.md) · [System design](system-design.md).

## Earlier brainstorm: context, not the current build plan

### Fundamental truth about software and bugs

There will always be a bug regardless if it’s an AI or a human engineer writing the code. What matters is we can fix the issue without introducing new ones. We build safety nets achieving these goals:

* Make it hard for other contributors (AI/human) to introduce more bugs  
* Make it easy for contributors to catch bugs if ever they slip up

### Senior-level approach for adding safety nets

Understand → Focus on what matters to the business/users → Ensure what we own (the code) has a safety net → If there’s more resources build safety net around the stuff we don’t own (E2E testing)

### How can we build a good enough v1 considering the above \+ making sure the UX for a non-technical founder is smooth AF?

### Working direction: business outcomes become lasting protection

VibeGuard turns “this must keep working” into a safety net the founder can understand. The entry point can be a broken app; the payoff is a verified repair and a lasting check against the same failure.

The core flow:

1. **Understand:** inspect the supported app and hear what the founder needs it to do.
2. **Confirm:** agree on a concrete business outcome, such as “valid enquiries appear in my dashboard.” Code reveals current behavior, not necessarily intended behavior.
3. **Check:** exercise that journey and verify its result. A success toast alone does not prove an enquiry was saved.
4. **Repair:** prepare an isolated change, rerun the agreed checks, and give the founder a preview to try.
5. **Protect:** retain those checks and run them against future changes. Describe precisely what passed and what remains unverified.

Protect connected behavior in the code we own. A small browser check can also provide visible evidence that the pieces work together; E2E testing is not exclusively about external services.

For the hackathon, keep the scope to one supported app, one important journey, and a bounded repair loop. Keep verification checks outside the repair agent's writable scope. A strong demo ends by introducing another regression and showing the retained check catching it. Preventing release requires an actual release gate; detecting a change after publication is monitoring.

### Earlier UX direction: voice-first, with a shared visual workspace

The founder should feel like they are talking to a developer who asks useful questions. They describe the problem in business language; VibeGuard turns the conversation into explicit, verifiable expectations.

Example:

> Founder: “Customers are sending enquiries, but I’m not getting them.”
>
> VibeGuard: “Where do you normally look for new enquiries?”
>
> Founder: “The dashboard. I should get an email too.”
>
> VibeGuard: “Does the customer see a confirmation even when the enquiry doesn’t appear?”
>
> Founder: “Yep.”

As they talk, build an editable **What we’re protecting** card:

* Valid enquiries appear in the dashboard.
* Customers see confirmation only after an enquiry is saved.
* A failed save shows an error and preserves the customer's input for retry.
* Email delivery is a separate outcome, initially marked unverified.

The founder can correct the card by speaking or editing. Confirm this agreement before using it to drive verification.

The workspace carries the evidence throughout: what VibeGuard understood, what failed, what changed, the preview, which checks passed, and what remains unverified. Spoken reassurance must never substitute for observed results.

Keep conversational and repair responsibilities distinct: the conversational side gathers intent and explains evidence; the repair side changes code and runs checks.

Proposed hackathon interaction: **tap to talk → review the understood outcome → investigate → review the fix**. Keep text available throughout. Applying a fix uses an explicit button so a casual spoken “yeah” cannot authorize an update.

### Earlier onboarding direction: connect through GitHub

Initially qualify founders whose app code is already connected to GitHub, regardless of the tool used to build it or the quality of the code. Accept messy code within environments we know how to run. Missing tests, duplicated logic, large components, and broken application behavior are expected; the founder should not need to clean up the codebase before VibeGuard can help.

Distinguish access to source code from the ability to reproduce the running app. The onboarding design still needs to settle supported runtimes, missing configuration and services, isolated previews, and how an approved change reaches the founder's published app.

Work backwards from this onboarding outcome: **“VibeGuard understands what matters in my app and has shown me the result of its first check.”** Connecting GitHub is a step toward that outcome.

1. **Connect:** “Connect your app with GitHub.” Explain access plainly and use a GitHub App installation with selected repository access.
2. **Choose:** select the app's repository and reuse that selection on return. Handle organization approval with a clear waiting-for-access state.
3. **Recognize:** confirm the app and optionally add its website URL. Automatically inspect its framework, startup instructions, and service dependencies.
4. **Talk:** “What's going wrong, or what must keep working?” Start the conversation while preparing an isolated workspace.
5. **Confirm:** review the editable What we're protecting card.
6. **See evidence:** show the first observed result, or explain exactly what prevented verification.

The supported path should require no terminal commands, package installation, or configuration files from the founder. Attempt ordinary setup automatically with bounded retries, then show one of three outcomes:

* **Ready:** “Your test copy is ready. Let's check the enquiry form.”
* **Needs a connection:** explain which service needs a test connection and provide a specific guided step. Collect credentials through a dedicated secure flow, never the voice transcript.
* **Unsupported setup:** explain the limitation and preserve the conversation and findings. Do not ask the founder to interpret build logs.

An isolated code copy also needs isolated test data and services for checks that make changes. For the hackathon, support one application stack and one reproducible test environment. Choose that exact stack in the implementation spec.

Track **fix verified**, **change saved**, and **live update verified** separately. Saving a change to GitHub does not by itself establish that the published app was updated. Preventing a release requires a real gate in the release path.

Product principle: **the founder connects their app and explains the problem; VibeGuard owns the technical setup within its supported scope.**

Reference: [GitHub App installation](https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party); [Lovable code, hosting, and backend separation](https://docs.lovable.dev/tips-tricks/deployment-hosting-ownership).
