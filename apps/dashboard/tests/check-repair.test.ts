import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Job, Project } from '@vibeguard/contracts';
import {
  baselineFailedProjectExample,
  baselineJobExample,
  checkedProjectExample,
  repairJobExample,
  repairEvidenceExample,
  repairDiffExample,
  unsuccessfulRepairJobExample,
  projectReadyExample,
} from '@vibeguard/contracts/examples';
import {
  candidatePreview,
  runCheckRepair,
  getRepairEvidence,
  getRepairDiff,
} from '../src/checkRepairClient';
import { CheckRepairPanel } from '../src/components/CheckRepairPanel';

const clone = <T>(value: T): T => structuredClone(value);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function network(
  responses: {
    url: string;
    payload: unknown;
    status?: number;
    body?: unknown;
  }[],
) {
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    const response = responses.shift();
    expect(response, `Unexpected request: ${url}`).toBeDefined();
    expect(url).toBe(response!.url);
    expect(init.headers).toMatchObject({ 'X-VibeGuard-Request': '1' });
    if (response!.body)
      expect(JSON.parse(init.body as string)).toEqual(response!.body);
    return new Response(JSON.stringify(response!.payload), {
      status: response!.status ?? 200,
    });
  });
  vi.stubGlobal('fetch', fetcher);
  return { fetcher, done: () => expect(responses).toHaveLength(0) };
}

function screen(project: Project, operation: 'check' | 'repair', demo = false) {
  return renderToStaticMarkup(
    createElement(CheckRepairPanel, {
      project,
      operation,
      demo,
      onProject: () => {},
      onContinue: () => {},
    }),
  );
}

describe('dashboard baseline and repair journeys', () => {
  it('starts original checks, polls progress, refreshes saved baseline, and renders failures with evidence and timings', async () => {
    vi.useFakeTimers();
    const ready: Project = {
      ...clone(baselineFailedProjectExample),
      baseline: null,
    };
    const running: Job = {
      ...clone(baselineJobExample),
      status: 'running',
      result: null,
      error: null,
      progress: { step: 'checking', message: 'Checking saved edits.' },
    };
    const net = network([
      {
        url: '/api/projects/project_demo/checks',
        payload: { jobId: 'job_demo' },
        body: {
          versionId: ready.originalVersion.id,
          goalRevisionId: ready.goal!.revisionId,
        },
      },
      { url: '/api/jobs/job_demo', payload: running },
      { url: '/api/jobs/job_demo', payload: baselineJobExample },
      {
        url: '/api/projects/project_demo',
        payload: baselineFailedProjectExample,
      },
    ]);
    const progress: Job[] = [];
    const pending = runCheckRepair({
      project: ready,
      operation: 'check',
      demo: false,
      alive: () => true,
      onJob: (job) => progress.push(job),
    });
    await vi.runAllTimersAsync();
    const finished = await pending;
    expect(progress.map((job) => job.status)).toEqual(['running', 'succeeded']);
    expect(finished.project.baseline).toEqual(
      baselineFailedProjectExample.baseline,
    );
    const html = screen(finished.project, 'check');
    expect(html).toContain('Before: original copy');
    for (const check of finished.project.baseline!.checks) {
      expect(html).toContain(check.name);
      for (const evidence of check.evidence) {
        expect(html).toContain(evidence.summary.replaceAll('&', '&amp;'));
        if (evidence.durationMs !== null)
          expect(html).toContain(`${evidence.durationMs.toLocaleString()} ms`);
      }
    }
    expect(html).toContain('Continue to repair');
    net.done();
  });

  it('uses current baseline identity for repair, reads protected artifacts, and offers human QA on the exact checked candidate', async () => {
    const source = clone(baselineFailedProjectExample);
    const net = network([
      {
        url: '/api/projects/project_demo/repairs',
        payload: { jobId: 'job_demo' },
        body: {
          sourceVersionId: source.originalVersion.id,
          goalRevisionId: source.goal.revisionId,
          baselineVerificationId: source.baseline.id,
        },
      },
      { url: '/api/jobs/job_demo', payload: repairJobExample },
      { url: '/api/projects/project_demo', payload: checkedProjectExample },
      {
        url: '/api/projects/project_demo/repair-evidence',
        payload: repairEvidenceExample,
      },
      {
        url: '/api/projects/project_demo/diffs/artifact_diff',
        payload: repairDiffExample,
      },
    ]);
    const finished = await runCheckRepair({
      project: source,
      operation: 'repair',
      demo: false,
      alive: () => true,
      onJob: () => {},
    });
    const evidence = await getRepairEvidence(source.id, false);
    const diff = await getRepairDiff(
      source.id,
      finished.repair!.diffArtifactId!,
      false,
    );
    expect(evidence.attempts[0].verification?.verdict).toBe('passed');
    expect(diff.changes).toEqual(repairDiffExample.changes);
    const html = screen(finished.project, 'repair');
    expect(html).toContain('After: candidate copy');
    expect(html).toContain('Try the fixed test app');
    expect(html).toContain('http://127.0.0.1:4402');
    expect(html).not.toContain('href="http://127.0.0.1:4401"');
    expect(html).not.toContain('Approve &amp; save locally');
    net.done();
  });

  it('treats successful execution with no_verified_fix as unsuccessful, and resumes jobs without starting again', async () => {
    const net = network([
      { url: '/api/jobs/job_existing', payload: unsuccessfulRepairJobExample },
      {
        url: '/api/projects/project_demo',
        payload: baselineFailedProjectExample,
      },
    ]);
    const finished = await runCheckRepair({
      project: baselineFailedProjectExample,
      operation: 'repair',
      demo: false,
      jobId: 'job_existing',
      alive: () => true,
      onJob: () => {},
    });
    expect(finished.repair?.outcome).toBe('no_verified_fix');
    expect(finished.repair?.attempts).toHaveLength(2);
    expect(candidatePreview(finished.project)).toBeNull();
    expect(screen(finished.project, 'repair')).not.toContain(
      'Try the fixed test app',
    );
    net.done();
  });

  it('blocks missing goals, stale/inconclusive baselines, and unsafe or wrong-version previews', async () => {
    const net = network([]);
    for (const project of [
      projectReadyExample,
      {
        ...baselineFailedProjectExample,
        baseline: {
          ...baselineFailedProjectExample.baseline,
          goalRevisionId: 'stale',
        },
      },
      {
        ...baselineFailedProjectExample,
        baseline: {
          ...baselineFailedProjectExample.baseline,
          verdict: 'could_not_check' as const,
        },
      },
    ]) {
      await expect(
        runCheckRepair({
          project,
          operation: 'repair',
          demo: false,
          alive: () => true,
          onJob: () => {},
        }),
      ).rejects.toThrow();
    }
    for (const project of [
      {
        ...checkedProjectExample,
        goal: { ...checkedProjectExample.goal, revisionId: 'new_goal' },
      },
      {
        ...checkedProjectExample,
        latestVerification: {
          ...checkedProjectExample.latestVerification,
          versionId: 'other',
        },
      },
      {
        ...checkedProjectExample,
        previews: checkedProjectExample.previews.map((preview) => ({
          ...preview,
          url: 'javascript:alert(1)',
        })),
      },
    ])
      expect(candidatePreview(project)).toBeNull();
    expect(screen(projectReadyExample, 'check')).toContain('Confirm your goal');
    expect(net.fetcher).not.toHaveBeenCalled();
  });

  it('reports a missing harness or failed job without publishing a candidate, and rejects wrong operation polls', async () => {
    for (const failure of [
      {
        status: 503,
        payload: {
          error: {
            message: 'Local repair is not configured.',
            nextStep: 'Connect the harness.',
          },
        },
      },
      {
        status: 200,
        payload: {
          ...repairJobExample,
          status: 'failed',
          result: null,
          error: { message: 'Repair timed out.', nextStep: 'Review the goal.' },
        },
      },
      { status: 200, payload: baselineJobExample },
    ]) {
      const isStart = failure.status === 503;
      const net = network([
        {
          url: isStart
            ? '/api/projects/project_demo/repairs'
            : '/api/jobs/existing',
          ...failure,
        },
      ]);
      await expect(
        runCheckRepair({
          project: baselineFailedProjectExample,
          operation: 'repair',
          demo: false,
          jobId: isStart ? undefined : 'existing',
          alive: () => true,
          onJob: () => {},
        }),
      ).rejects.toThrow();
      net.done();
    }
  });

  it('keeps demo checks and both repair outcomes off the network and labels sample previews', async () => {
    vi.useFakeTimers();
    const net = network([]);
    for (const unsuccessful of [false, true]) {
      const pending = runCheckRepair({
        project: baselineFailedProjectExample,
        operation: 'repair',
        demo: true,
        unsuccessful,
        alive: () => true,
        onJob: () => {},
      });
      await vi.runAllTimersAsync();
      const finished = await pending;
      expect(finished.repair?.outcome).toBe(
        unsuccessful ? 'no_verified_fix' : 'checked',
      );
      const html = screen(finished.project, 'repair', true);
      expect(html).toContain('Sample results only');
      expect(html).not.toContain('href="http://127.0.0.1:4402"');
    }
    expect(net.fetcher).not.toHaveBeenCalled();
  });
});
