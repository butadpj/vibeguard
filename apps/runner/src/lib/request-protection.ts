import type { RequestHandler } from 'express';
import { ApiFailure } from './api-errors.js';

const allowedHosts = new Set([
  '127.0.0.1:4310',
  'localhost:4310',
  '127.0.0.1:5173',
  'localhost:5173',
]);
export const protectRequests: RequestHandler = (request, _response, next) => {
  if (!allowedHosts.has(request.headers.host ?? ''))
    return next(
      new ApiFailure(
        403,
        'invalid_request',
        'Use the local VibeGuard address.',
      ),
    );
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return next();
  const origin = request.get('origin');
  if (origin && ![...allowedHosts].some((host) => origin === `http://${host}`))
    return next(
      new ApiFailure(
        403,
        'invalid_request',
        'This origin cannot change local projects.',
      ),
    );
  if (
    request.get('sec-fetch-site') === 'cross-site' ||
    request.get('x-vibeguard-request') !== '1'
  )
    return next(
      new ApiFailure(
        403,
        'invalid_request',
        'Send X-VibeGuard-Request: 1 from the local dashboard.',
      ),
    );
  next();
};
