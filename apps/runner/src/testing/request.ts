import type { Express } from 'express';
import { IncomingMessage, ServerResponse } from 'node:http';
import { PassThrough } from 'node:stream';
import type { Socket } from 'node:net';
import { once } from 'node:events';

/** In-process HTTP transport. Keep Express routing, parsing and error handling real. */
export function createTestClient(app: Express) {
  return {
    async request(path: string, options: RequestInit = {}): Promise<Response> {
      // Use the browser encoder, including multipart boundaries, rather than pre-parsed bodies.
      const input = new Request(
        new URL(path, 'http://localhost:4310'),
        options,
      );
      const body = Buffer.from(await input.arrayBuffer());
      const socket = new PassThrough();
      const chunks: Buffer[] = [];
      socket.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      const request = new IncomingMessage(socket as unknown as Socket);
      request.method = input.method;
      request.url = new URL(input.url).pathname + new URL(input.url).search;
      // The synthetic transport supplies a complete message; avoid treating EOF as a socket abort.
      request.complete = true;
      request.httpVersion = '1.1';
      request.httpVersionMajor = 1;
      request.httpVersionMinor = 1;
      request.headers = Object.fromEntries(input.headers);
      request.headers.host ??= 'localhost:4310';
      request.headers.connection = 'close';
      if (options.body != null)
        request.headers['content-length'] = String(body.length);
      const response = new ServerResponse(request);
      response.assignSocket(socket as unknown as Socket);
      const finished = once(response, 'finish');
      app(request, response);
      request.push(body.length ? body : null);
      if (body.length) request.push(null);
      await finished;
      const wire = Buffer.concat(chunks);
      const payload = wire.subarray(wire.indexOf('\r\n\r\n') + 4);
      const headers = new Headers();
      for (const [name, value] of Object.entries(response.getHeaders())) {
        if (value !== undefined) headers.set(name, String(value));
      }
      // API JSON responses have Content-Length; fail clearly if the harness needs streaming support.
      if (headers.has('transfer-encoding'))
        throw new Error('Test transport does not support chunked responses.');
      socket.destroy();
      return new Response(
        [204, 304].includes(response.statusCode) ? null : payload,
        {
          status: response.statusCode,
          headers,
        },
      );
    },
  };
}
