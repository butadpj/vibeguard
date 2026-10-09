import express from 'express';
import { expect, it } from 'vitest';
import { logRequests, enrichEvent, type LogEvent } from './logging.js';
import { createJobBoard } from './job-board.js';
import { createGoalConversation } from '../features/goals/ollama-conversation.js';
import { createTestClient } from '../testing/request.js';

it('correlates an accepted request with its later failed model job without logging secrets', async () => {
  const events: LogEvent[] = [];
  const sink = (event: LogEvent) => events.push({ ...event });
  const jobs = createJobBoard(sink);
  const app = express();
  app.use(logRequests(sink), express.json());
  let finish!: () => void;
  const delayed = new Promise<void>((resolve) => {
    finish = resolve;
  });
  app.post('/projects/:id/messages', (req, res) => {
    const id = jobs.start(
      {
        projectId: req.params.id,
        operation: 'message',
        goalRevisionId: null,
        versionId: 'v1',
        message: 'private message',
      },
      async () => {
        await delayed;
        enrichEvent({ job_stage: 'investigating' });
        await createGoalConversation({
          provider: 'openrouter',
          url: '',
          model: 'test-model',
          apiKey: 'private-key',
          fetch: async () =>
            new Response('private provider body', { status: 402 }),
        })({
          projectId: 'p1',
          name: 'private project',
          messages: [{ id: 'm1', role: 'user', text: 'private conversation' }],
          goal: null,
        });
        throw new Error('Expected cloud rejection.');
      },
    );
    res.status(202).json({ jobId: id });
  });
  const response = await createTestClient(app).request(
    '/projects/p1/messages?secret=private-query',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'private-header',
      },
      body: JSON.stringify({ text: 'private-body' }),
    },
  );
  const { jobId } = await response.json();
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    event: 'request',
    status_code: 202,
    route: '/projects/:id/messages',
    job_id: jobId,
  });
  finish();
  await jobs.whenDone(jobId);
  expect(events).toHaveLength(2);
  expect(events[1]).toMatchObject({
    event: 'job',
    request_id: response.headers.get('X-Request-Id'),
    job_id: jobId,
    outcome: 'failed',
    error_code: 'model_unavailable',
    model_http_status: 402,
    model: 'test-model',
    job_stage: 'investigating',
  });
  expect(events[1].duration_ms).toBeTypeOf('number');
  expect(JSON.stringify(events)).not.toContain('private');
  expect(jobs.getActive()).toBeNull();
});

it('records failed check verdicts even when the check job finishes successfully', async () => {
  const events: LogEvent[] = [];
  const jobs = createJobBoard((event) => events.push(event));
  const id = jobs.start(
    {
      projectId: 'p',
      operation: 'check',
      goalRevisionId: 'g',
      versionId: 'v',
      message: 'Checking',
    },
    async () => ({
      id: 'verification',
      projectId: 'p',
      versionId: 'v',
      goalRevisionId: 'g',
      checkSetId: 'crud',
      verdict: 'failed',
      checks: [
        {
          id: 'update',
          name: 'Update',
          scope: 'update',
          verdict: 'failed',
          explanation: 'private evidence',
          evidence: [],
        },
      ],
    }),
  );
  await jobs.whenDone(id);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    event: 'job',
    outcome: 'succeeded',
    check_verdict: 'failed',
    checks_failed: 1,
    checks_total: 1,
    verification_id: 'verification',
  });
  expect(JSON.stringify(events)).not.toContain('private evidence');
});
