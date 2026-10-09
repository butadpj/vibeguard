import type {
  ErrorResponse,
  Job,
  JobOperation,
  JobResultMap,
} from '@vibeguard/contracts';

export class RunnerError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
  }
}

async function send<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new RunnerError(
      'Could not reach the local runner. Start it and try again.',
    );
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (payload as ErrorResponse | null)?.error;
    throw new RunnerError(
      error
        ? [error.message, error.nextStep].filter(Boolean).join(' ')
        : 'The runner could not complete the request.',
      response.status,
    );
  }
  return payload as T;
}

/** Call the local runner. Throws a RunnerError with founder-readable text.
 * Every write carries the local-dashboard header; JSON writes add a content type. */
export function call<T>(
  url: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
): Promise<T> {
  const write = method !== 'GET';
  return send<T>(url, {
    method,
    headers: write
      ? {
          'X-VibeGuard-Request': '1',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        }
      : undefined,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Multipart write; the browser sets the boundary. */
export function upload<T>(url: string, form: FormData): Promise<T> {
  return send<T>(url, {
    method: 'POST',
    headers: { 'X-VibeGuard-Request': '1' },
    body: form,
  });
}

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Poll a job until it finishes. Throws with the job's own error message.
 * onProgress receives each running job so screens can show its progress. */
export async function waitForJob<O extends JobOperation>(
  jobId: string,
  operation: O,
  alive: () => boolean,
  onProgress?: (job: Job) => void,
): Promise<JobResultMap[O]> {
  while (alive()) {
    const job = await call<Job>(`/api/jobs/${encodeURIComponent(jobId)}`);
    onProgress?.(job);
    if (job.status === 'failed') {
      throw new RunnerError(
        [job.error.message, job.error.nextStep].filter(Boolean).join(' '),
      );
    }
    if (job.status === 'cancelled')
      throw new RunnerError('The job was cancelled.');
    if (job.status === 'succeeded' && job.operation === operation) {
      return job.result as JobResultMap[O];
    }
    await sleep(800);
  }
  throw new RunnerError('Stopped waiting.');
}
