import type { RequestHandler } from 'express';
import type { ErrorResponse } from '@vibeguard/contracts';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

function hostnameOf(value: string): string | null {
  try {
    return new URL(value.includes('://') ? value : `http://${value}`).hostname;
  } catch {
    return null;
  }
}

/** Stops other websites and DNS-rebinding tricks from changing local files.
 * Reads pass through. Writes need a loopback Host and, when sent, a loopback
 * Origin. Put this in front of every route that changes files or starts work. */
export const protectMutations: RequestHandler = (request, response, next) => {
  if (request.method === 'GET' || request.method === 'HEAD') {
    next();
    return;
  }
  const host = request.headers.host ? hostnameOf(request.headers.host) : null;
  const origin = request.headers.origin;
  const originHost = origin ? hostnameOf(origin) : null;
  const hostOk = host !== null && LOOPBACK.has(host);
  const originOk = !origin || (originHost !== null && LOOPBACK.has(originHost));
  if (!hostOk || !originOk) {
    response.status(403).json({
      error: {
        code: 'invalid_request',
        message: 'This request did not come from the VibeGuard dashboard.',
        nextStep: 'Open VibeGuard at http://127.0.0.1:4310 and try again.',
      },
    } satisfies ErrorResponse);
    return;
  }
  next();
};
