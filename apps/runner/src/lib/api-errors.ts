import type { RequestHandler, ErrorRequestHandler } from 'express';
import type { ErrorCode, ErrorResponse } from '@vibeguard/contracts';

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
  if (
    _error instanceof ApiFailure ||
    _error?.status === 413 ||
    _error?.status === 415
  ) {
    response.status(_error.status).json({
      error: {
        code: _error instanceof ApiFailure ? _error.code : 'invalid_request',
        message:
          _error instanceof ApiFailure
            ? _error.message
            : 'Upload exceeds the limit or uses unsupported encoding.',
        nextStep: null,
      },
    } satisfies ErrorResponse);
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

export class ApiFailure extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}
