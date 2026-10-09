import type { ErrorResponse } from '@vibeguard/contracts';

export class RunnerError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
  }
}

/** Call the local runner. Throws a RunnerError with founder-readable text. */
export async function call<T>(
  url: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers:
        body === undefined
          ? undefined
          : { 'Content-Type': 'application/json', 'X-VibeGuard-Request': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
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
