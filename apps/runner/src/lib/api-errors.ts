import type { RequestHandler, ErrorRequestHandler, Response } from 'express';
import type { ApiError, ErrorResponse } from '@vibeguard/contracts';

export function sendApiError(
  response: Response,
  status: number,
  error: ApiError,
) {
  response.status(status).json({ error } satisfies ErrorResponse);
}

/** Placeholder only: no input parsing, file access, or process execution. */
export function notImplemented(operation: string): RequestHandler {
  return (_request, response) => {
    response.status(501).json({
      error: {
        code: 'not_implemented',
        message: `${operation} is not implemented yet.`,
        nextStep:
          'Use shared contract fixtures while this operation is being built.',
      },
    } satisfies ErrorResponse);
  };
}
export const apiNotFound: RequestHandler = (_request, response) => {
  response.status(404).json({
    error: { code: 'not_found', message: 'Unknown API route.', nextStep: null },
  } satisfies ErrorResponse);
};
export const apiErrorHandler: ErrorRequestHandler = (
  _error,
  _request,
  response,
  next,
) => {
  if (response.headersSent) {
    next(_error);
    return;
  }
  response.status(500).json({
    error: {
      code: 'internal_error',
      message: 'The runner could not complete the request.',
      nextStep: 'Try again.',
    },
  } satisfies ErrorResponse);
};
