import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type { RequestHandler } from 'express';

export type LogEvent = Record<
  string,
  string | number | boolean | null | undefined
>;
export type LogSink = (event: LogEvent) => void;
export const logContext = new AsyncLocalStorage<LogEvent>();
const instanceId = randomUUID();

/** Only add operational metadata; never bodies, headers, model text, or raw errors. */
export function enrichEvent(fields: LogEvent) {
  Object.assign(logContext.getStore() ?? {}, fields);
}
export function writeEvent(event: LogEvent) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'vibeguard-runner',
      service_version: '0.1.0',
      instance_id: instanceId,
      host: hostname(),
      ...event,
    }),
  );
}

export function logRequests(sink: LogSink = writeEvent): RequestHandler {
  return (request, response, next) => {
    const start = performance.now();
    const event: LogEvent = {
      event: 'request',
      request_id: randomUUID(),
      method: request.method,
    };
    response.setHeader('X-Request-Id', String(event.request_id));
    let emitted = false;
    const emit = () => {
      if (emitted) return;
      emitted = true;
      // Route templates avoid leaking arbitrary paths or query strings.
      event.route = request.route?.path ?? 'unmatched';
      event.status_code = response.statusCode;
      event.outcome = response.writableFinished
        ? response.statusCode >= 400
          ? 'error'
          : 'success'
        : 'aborted';
      event.level = event.outcome === 'success' ? 'info' : 'error';
      event.duration_ms = Math.round(performance.now() - start);
      sink(event);
    };
    response.once('finish', emit);
    response.once('close', emit);
    logContext.run(event, next);
  };
}
