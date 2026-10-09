import type { RequestHandler, Request, Response } from 'express';
import type { ErrorCode } from '@vibeguard/contracts';
import { sendApiError } from './api-errors.js';

const STATUS: Partial<Record<ErrorCode, number>> = {
  invalid_request: 400,
  not_found: 404,
  conflict: 409,
  version_mismatch: 409,
  check_unavailable: 409,
};

/** A failure the founder can act on. Carries a contract error code. */
export class ReleaseError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly nextStep: string | null = null,
  ) {
    super(message);
    this.name = 'ReleaseError';
  }
  get status(): number {
    return STATUS[this.code] ?? 500;
  }
}

/** Run an async route and turn ReleaseError into the shared error envelope. */
export function handleRelease(
  run: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
  return async (request, response, next) => {
    try {
      await run(request, response);
    } catch (error) {
      if (error instanceof ReleaseError) {
        sendApiError(response, error.status, {
          code: error.code,
          message: error.message,
          nextStep: error.nextStep,
        });
        return;
      }
      next(error);
    }
  };
}
