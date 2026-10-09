---
name: VibeGuard dashboard
description: A calm, playable founder flow in the existing lime, ink, and Geist identity.
colors:
  ink: "#18352d"
  muted: "#52665e"
  paper: "#fafbf7"
  lime: "#d2f86d"
  line: "#dce3da"
  soft: "#f0f3eb"
  red: "#9c322b"
  red-bg: "#fff0ec"
  green: "#246044"
  green-bg: "#e8f3e7"
  white: "#fff"
  lime-hover: "#bfe64f"
  focus: "#6e8b21"
  story-surface: "#f0f3ea"
  scenario-tools: "#eef3e4"
  app-mark-bg: "#e5edd4"
  app-mark-ink: "#29452d"
  context-surface: "#edf2e4"
  inbox-empty: "#f6f8f2"
  fixture-notice: "#eaf0df"
typography:
  headline:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "2.625rem"
    fontWeight: 650
    lineHeight: 1.16
    letterSpacing: "-.03em"
  title:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 620
    lineHeight: 1.35
    letterSpacing: "-.015em"
  body:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "1.25rem"
    lineHeight: 1.6
  intro:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "1.25rem"
  button:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
  note:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "1rem"
rounded:
  panel: "12px"
  navigation: "10px"
  control: "9px"
  field: "8px"
  badge: "6px"
spacing:
  action-gap: "16px"
  panel-padding: "28px"
  panel-gap: "24px"
  action-top: "28px"
  app-grid-gap: "28px"
components:
  button-primary:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "14px 22px"
  button-primary-hover:
    backgroundColor: "{colors.lime-hover}"
  button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "14px 22px"
  panel:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.panel}"
    padding: "28px"
  text-field:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "16px"
  badge:
    backgroundColor: "{colors.soft}"
    rounded: "{rounded.badge}"
    padding: "7px 12px"
---

# Design System: VibeGuard dashboard

## Team repository usage

Use this document as design guidance for the React dashboard. Executable starter tokens live in packages/design-tokens/tokens.css. The dashboard implements the five-stage shell (team decision 2026-10-10: the "Mission Control" step-rail layout in the existing palette), with Open project connected to the runner and Approve & keep checking on a seeded demo project; the middle stages show their planned purpose until connected. Keep visual changes aligned with this document and update tokens and guidance together.

## Overview

**Creative North Star: "Your app, protected."**

The existing promo identity becomes a spacious, readable workspace: dark green navigation, lime actions, off-white space, white task panels, and Geist typography. Five large steps sit above a founder workspace and an optional story reader. Hiding stories expands the task surfaces; conversation and goal, or report and test-app link card, can sit side by side. Body copy is 20px on desktop and 18px on phones; controls are 18px and supporting copy stays at least 16px. The matching human-readable story explains the task and supports the founder's decisions.

Executable tokens live in `packages/design-tokens/tokens.css`. The React dashboard implements the step rail, runner status, demo-data switch, Open project, and the US5 demo. The story reader, test scenarios, and later stages below remain planned; they do not establish implemented behavior. The CRUD stack and local model still need a real offline demo.

**Key Characteristics:**
- Existing lime, ink, and Geist brand.
- A dark green step rail beside the task column (a scrolling row on narrow screens), an optional story reader, and mobile stacking.
- Readable 20px desktop copy, 18px controls, and 16px supporting text.
- Restrained borders, flat panels, and plainly named states.

## Colors

Lime identifies primary actions and the current step. Ink anchors text, navigation, and toast messages. Paper, white, soft, and the story surface separate content without gradients. Muted text supports explanations and labels; line draws quiet boundaries.

Green with green-bg indicates passed or ready states. Red with red-bg indicates failure. Neutral soft indicates pending or unverified results. Status language accompanies color.

## Typography

Use bundled variable Geist, falling back to Arial and sans-serif. Desktop body and introductory copy use the body role; intro is limited to 55ch. Supporting notes and labels use 1rem (16px). Controls use 1.125rem (18px). The brand uses 28px, weight 720, and -.03em tracking. Story headings use 1.75rem/1.3 (28px) with -.02em tracking; story quotes use body size with 1.7 line height. Step headlines use `clamp(2rem, 4.4vw, 3.25rem)`, weight 700, 1.06 line height, and -.04em tracking, under a 16px uppercase monospace eyebrow (`Step 01 / 05 · Open project`) in green. Monospace (`--font-mono`, a local system stack so the dashboard works offline) is reserved for eyebrows, rail statuses, status pills, and progress logs.

At 1200px and below, the main headline becomes 2.375rem (38px) and step labels 1rem (16px). At 600px and below, body becomes 1.125rem (18px), the main headline 2rem (32px), titles 1.375rem (22px), and story headings 1.625rem (26px). Supporting text remains at least 16px.

## Layout

Implemented shell: a wrapping ink top bar (76px minimum height, 16px 32px padding) holds the brand, a runner-status pill that rechecks on click, and a Demo data switch (lime when on, with a lime banner below the bar while active). Below it, a 300px ink step rail sits beside the task column. Rail steps are 72px buttons with a circular mono number (a check when done), the step label, and a mono status line; the current step is lime/ink. The task column has 48px 44px 64px padding, content capped at 960px, and stacks the step head, panels, and wrapping action rows with 24–28px gaps. At 1000px and below, the rail becomes a horizontally scrolling row above the task column. The rest of this section describes the original planned layout for parts not yet built.

The wrapping header has a 92px minimum height, 20px 40px padding, and 16px gaps. The simulated offline toggle, story reader, test scenarios, and reset controls sit alongside the brand. A centered workspace, at most 1640px wide, places five equal step buttons across the top, followed by task and story columns: `minmax(0, 1.3fr) minmax(390px, .85fr)`. Navigation padding is 20px 32px, with 12px gaps and 60px minimum-height steps. Main content is at most 960px wide with 48px 44px 64px padding; story padding is 48px 36px. Panels have the documented padding and gap; action rows wrap. Hiding stories changes the workspace to one column and increases main width to 1480px. Inside it, task surfaces use `repeat(auto-fit, minmax(min(100%, 340px), 1fr))` with 28px gaps; direct panel children have no bottom margin.

At 1200px and below, main padding is 40px 28px 56px, story padding 40px 28px, and navigation padding 18px 24px. At 1000px and below, use one column: horizontally scrollable steps, task, then story. Step buttons have 56px minimum height. Main content is capped at 800px with 40px 32px padding; story uses 36px 32px padding and a top border. Its contents are capped at 70ch. When stories are hidden, main width is capped at 900px. Test scenarios appear in a separate disclosure below the header with 24px 40px padding; individual scenario fields are capped at 520px.

At 600px and below, the header wraps with 18px 20px padding, placing supporting status text on a separate line. Main padding is 32px 20px 40px; story padding 32px 24px; panels and previews use 22px padding. Primary actions and sample-conversation buttons fill their rows, while evidence check rows stack their labels and values. The app grid gap becomes 22px; scenario-area padding is 24px 20px. The story and scenario toggle buttons share a row.

## Elevation & Depth

Panels are flat, separated by tonal surfaces and 1px borders. Only the fixed bottom-center toast has a shadow (`0 5px 22px #18352d26`). Buttons transition background and color over .16s ease-out; pressing shifts them down 1px. An active progress dot pulses over 1s. Reduced-motion preferences disable animations and transitions.

## Shapes

Panels and preview containers use the panel radius; navigation and conversation bubbles use 10px corners. Action controls and status boxes use 9px, fields 8px, and badges 6px. Step numbers, connection dots, and progress markers are circular. Borders define panels and record rows.

## Components

Primary buttons use lime/ink and the lime-hover state. Secondary buttons are white with a `#bccbbf` border and soft hover. Quiet actions are underlined muted text. Disabled buttons have .48 opacity and a not-allowed cursor. Keyboard focus uses a 3px focus-colored outline with 4px offset across interactive controls.

Primary, secondary, and quiet actions have a 52px minimum height. Textareas and text inputs fill available width with `#b5c3b7` borders and 16px padding; textareas resize vertically with a 140px minimum height. Placeholders use `#5d7065`. Selects have a 50px minimum height. Folder and ZIP file pickers fill their container and use 16px text. Their native selector buttons use soft backgrounds, line borders, 8px corners, and 14px 16px padding. On phones, selector buttons occupy their own line.

Navigation shows Open project, Set the goal, Catch the bug, Try the fix, and Approve & keep checking. The current step uses lime/ink, other steps use pale text on ink, and hover uses `#24493e`. Setup and check gates disable unavailable steps with .55 opacity and a not-allowed cursor. Incomplete setup blocks investigation. Result badges pair compact text with neutral, pass, or fail surfaces. Evidence rows use dividers and plain labels. The optional story reader follows the active step, with explanatory copy, a short checklist, and a separated “Why this matters” callout. Header and reader hide controls update `aria-expanded`; visibility is remembered in local storage. Test-scenario switches live in their own header disclosure, outside the founder task surfaces.

Project context uses the existing 48px rounded T mark (68px in the welcome panel), the selected project name, preparation state, and a neutral badge naming the simulated internet state. Text conversation and the editable goal occupy paired panels. Replies and check reports label simulated or unverified results. The setup screen separates preparation results from the next action; its disabled buttons explain missing setup or internet.

The test-workspace card contains a before/after badge, a read-only URL in 16px text, Copy link, and a primary link opening the task app in a separate tab. Each workspace and version keeps separate test records. The dashboard explains that the browser CRUD fixture represents the demo rather than running imported files.

The standalone task app retains the shared body, field, button, and status styles. A tinted notice names the test version and browser storage. The header and main area remain capped at 1280px; header padding is 28px 32px and main padding 60px 32px. A task title, status selector, and Add task or Save changes action sit beside Saved tasks in the existing app grid, with a 32px top gap. Each record uses a flat panel, title, neutral status badge, Edit button, and quiet Delete action; record action rows have a 16px top margin. Failure messages retain form values. At 600px and below, main padding is 32px 20px and the grid top gap becomes 24px. A footer disclosure holds saving-failure and sample-reset controls.

Approval uses “Approve & save locally.” The handoff panel lists the checked code, service setup, run instructions, and retained checks; the demo ZIP download names its sample contents. History rows pair a local-version description with a result badge. Sharing, GitHub, and publishing remain later actions.

## Do's and Don'ts

- **Do** retain the lime, ink, and Geist identity for the dashboard.
- **Do** keep the active task and matching story synchronized.
- **Do** preserve the story reader toggle and keep test-scenario switches in their separate disclosure.
- **Do** retain generous reading sizes and supporting copy of at least 16px.
- **Do** name passed, failed, and unverified states in text.
- **Do** preserve visible keyboard focus and reduced-motion behavior.
- **Don't** treat simulated integrations or this sample app as production behavior.
- **Don't** add shadows to the flat task panels or invent a replacement visual identity.

## Interface language

Use “test app,” “test copy,” and “test records” in founder screens. Buttons describe the next action: “Use sample task app,” “Confirm goal & continue,” “Try the fixed test app,” and “Approve & save locally.” Name setup failures, simulated offline mode, and sample reports. Describe the demo ZIP as sample app code and handoff examples; imported files stay unchanged. A passing check describes the agreed result in the test copy. Publishing requires a separate step.
