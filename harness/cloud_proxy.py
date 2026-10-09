"""Trusted, single-request OpenRouter gateway. No agent files or Docker socket."""
import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

LIMIT = 2 * 1024 * 1024
ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'


class GatewayHandler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass  # Do not record prompts, headers, or credentials.

    def reply(self, status, value):
        data = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/health':
            self.reply(200, {'model': self.server.model, 'error': getattr(self.server, 'provider_error', None)})
        else:
            self.reply(404, {'error': 'Only health and chat completions are available.'})

    def do_POST(self):
        if self.path != '/v1/chat/completions':
            self.reply(404, {'error': 'Unsupported gateway path.'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length < 1 or length > LIMIT:
                raise ValueError()
            body = json.loads(self.rfile.read(length))
            if (not isinstance(body, dict) or body.get('model') != self.server.model
                    or body.get('stream', False) is not False
                    or not isinstance(body.get('messages'), list) or not body['messages']
                    or any(not isinstance(message, dict) or message.get('role') not in ['system', 'user', 'assistant']
                           or not isinstance(message.get('content'), str) for message in body['messages'])
                    or type(body.get('max_tokens')) is not int
                    or not 1 <= body['max_tokens'] <= self.server.output_tokens):
                raise ValueError()
        except (ValueError, TypeError):
            self.reply(400, {'error': 'Invalid or out-of-budget completion request.'})
            return
        if self.server.used:
            self.reply(409, {'error': 'Only one inference request is allowed per phase.'})
            return
        self.server.used = True
        # Fixed destination and fields prevent generic forwarding and provider fallbacks.
        payload = {'model': self.server.model, 'messages': body['messages'],
                   'max_tokens': body['max_tokens'], 'stream': False,
                   'reasoning': {'effort': 'low', 'exclude': True},
                   'usage': {'include': True},
                   'provider': {'allow_fallbacks': False}}
        request = urllib.request.Request(ENDPOINT, data=json.dumps(payload).encode(), headers={
            'Authorization': 'Bearer ' + self.server.api_key,
            'Content-Type': 'application/json',
        })
        try:
            with self.server.upstream(request, timeout=self.server.timeout) as response:
                raw = response.read(LIMIT + 1)
            if len(raw) > LIMIT:
                raise ValueError()
            result = json.loads(raw.replace(self.server.api_key.encode(), b'[redacted]'))
        except urllib.error.HTTPError as error:
            self.server.provider_error = f'OpenRouter returned HTTP {error.code}.'
            self.reply(error.code, {'error': self.server.provider_error})
            return
        except (OSError, ValueError):
            self.server.provider_error = 'OpenRouter did not return a bounded JSON response.'
            self.reply(502, {'error': self.server.provider_error})
            return
        self.reply(200, result)


if __name__ == '__main__':
    server = HTTPServer(('0.0.0.0', 8000), GatewayHandler)
    server.api_key = os.environ['OPENROUTER_API_KEY']
    server.model = os.environ['VIBEGUARD_CLOUD_MODEL']
    server.output_tokens = int(os.environ['VIBEGUARD_OUTPUT_TOKENS'])
    server.timeout = max(1, float(os.environ['VIBEGUARD_PHASE_TIMEOUT']) - 10)
    server.upstream = urllib.request.urlopen
    server.used = False
    server.serve_forever()
