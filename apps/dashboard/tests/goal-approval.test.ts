import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  checkedProjectExample,
  conversationJobExample,
  projectReadyExample,
  proposedGoalExample,
} from '@vibeguard/contracts/examples';
import { discussGoal, confirmGoal } from '../src/goalClient';
import { GoalPanel } from '../src/components/GoalPanel';
import { ApprovalPanel } from '../src/components/ApprovalPanel';

afterEach(() => vi.unstubAllGlobals());

it('discusses through a local job, confirms the current edited revision, and reloads authoritative state', async () => {
  const proposed = { ...projectReadyExample, goal: proposedGoalExample };
  const responses = [
    { jobId: 'conversation' },
    conversationJobExample,
    proposed,
    checkedProjectExample.goal,
    {
      ...checkedProjectExample,
      baseline: null,
      latestVerification: null,
      approval: null,
    },
  ];
  const fetcher = vi.fn(
    async () => new Response(JSON.stringify(responses.shift())),
  );
  vi.stubGlobal('fetch', fetcher);
  const next = await discussGoal(
    projectReadyExample,
    'Edits disappear after reload.',
    false,
    () => true,
    () => {},
  );
  expect(fetcher.mock.calls[0]).toEqual([
    '/api/projects/project_demo/messages',
    expect.objectContaining({
      body: JSON.stringify({ text: 'Edits disappear after reload.' }),
      headers: expect.objectContaining({ 'X-VibeGuard-Request': '1' }),
    }),
  ]);
  const draft = {
    description: 'Persist edits',
    expectedBehavior: 'Updated names survive reload.',
    performance: { action: 'Update a task', maxDurationMs: 500 },
  };
  const confirmed = await confirmGoal(next, draft, false);
  expect(fetcher.mock.calls[3]).toEqual([
    '/api/projects/project_demo/goal/confirm',
    expect.objectContaining({
      body: JSON.stringify({
        expectedRevisionId: proposedGoalExample.revisionId,
        goal: draft,
      }),
    }),
  ]);
  expect(confirmed.latestVerification).toBeNull();
  expect(responses).toHaveLength(0);
});

it('shows editable goals and explicit sample conversation, without contacting the runner in demo mode', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const proposed = await discussGoal(
    projectReadyExample,
    'Edits disappear.',
    true,
    () => true,
    () => {},
  );
  const html = renderToStaticMarkup(
    createElement(GoalPanel, {
      project: proposed,
      demo: true,
      onProject: () => {},
      onContinue: () => {},
    }),
  );
  expect(html).toContain('Sample conversation only');
  expect(html).toContain('Sample assistant');
  expect(html).toContain('Confirm goal &amp; continue');
  expect(html).toContain('Confirming a goal does not approve a fix');
  const confirmed = await confirmGoal(proposed, proposedGoalExample, true);
  expect(confirmed.goal?.status).toBe('confirmed');
  expect(confirmed.baseline).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});

it('blocks goal writes while setup is incomplete or another task is active', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  for (const project of [
    { ...projectReadyExample, activeJobId: 'running' },
    {
      ...projectReadyExample,
      setup: { ...projectReadyExample.setup, status: 'incomplete' as const },
    },
  ]) {
    await expect(
      discussGoal(
        project,
        'Problem',
        false,
        () => true,
        () => {},
      ),
    ).rejects.toThrow();
    await expect(
      confirmGoal(
        { ...project, goal: proposedGoalExample },
        proposedGoalExample,
        false,
      ),
    ).rejects.toThrow();
  }
  expect(fetcher).not.toHaveBeenCalled();
});

it('resumes the existing message job without sending a duplicate message and surfaces failed jobs', async () => {
  const responses = [conversationJobExample, projectReadyExample];
  const fetcher = vi.fn(
    async () => new Response(JSON.stringify(responses.shift())),
  );
  vi.stubGlobal('fetch', fetcher);
  await discussGoal(
    { ...projectReadyExample, activeJobId: 'existing' },
    '',
    false,
    () => true,
    () => {},
    'existing',
  );
  expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
    '/api/jobs/existing',
    '/api/projects/project_demo',
  ]);
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ...conversationJobExample,
            status: 'failed',
            result: null,
            error: {
              message: 'Local model unavailable.',
              nextStep: 'Start the local model.',
            },
          }),
        ),
    ),
  );
  await expect(
    discussGoal(
      projectReadyExample,
      '',
      false,
      () => true,
      () => {},
      'failed',
    ),
  ).rejects.toThrow('Local model unavailable. Start the local model.');
});

it('only enables approval for passing checks bound to the current goal and exact candidate, with no active task', () => {
  for (const project of [
    checkedProjectExample,
    {
      ...checkedProjectExample,
      goal: { ...checkedProjectExample.goal, revisionId: 'new_goal' },
    },
    { ...checkedProjectExample, activeJobId: 'running' },
  ]) {
    const html = renderToStaticMarkup(
      createElement(ApprovalPanel, { project }),
    );
    expect(html.includes('disabled=""')).toBe(
      project !== checkedProjectExample,
    );
  }
});
