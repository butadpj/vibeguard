"""Real HTTP handler with an in-memory transport and a fake external provider."""
import io
import json
import unittest
import urllib.error
from types import SimpleNamespace
from cloud_proxy import GatewayHandler, ENDPOINT
from invoke import DIAGNOSIS_FORMAT


class Transport:
    def __init__(self, request):
        self.request = io.BytesIO(request)
        self.response = bytearray()

    def makefile(self, *_args):
        return self.request

    def sendall(self, data):
        self.response.extend(data)


class GatewayTests(unittest.TestCase):
    def setUp(self):
        self.requests = []
        self.fail = False

        def upstream(request, timeout):
            self.requests.append((request, timeout))
            if self.fail:
                raise urllib.error.HTTPError(ENDPOINT, 401, 'Unauthorized', {}, None)
            return io.BytesIO(json.dumps({'id': 'synthetic_request', 'model': 'anthropic/test-model',
                'choices': [{'message': {'content': 'Fix evidence ' + self.server.api_key}}],
                'usage': {'prompt_tokens': 25, 'completion_tokens': 10}}).encode())

        self.server = SimpleNamespace(model='anthropic/test-model', api_key='synthetic-secret',
            output_tokens=4096, timeout=290, used=False, upstream=upstream)
        self.payload = {'model': self.server.model, 'messages': [{'role': 'user', 'content': 'Repair the fixture.'}],
                        'max_tokens': 4096, 'stream': False}

    def call(self, path='/v1/chat/completions', body=None, method='POST'):
        data = json.dumps(self.payload if body is None else body).encode()
        wire = f'{method} {path} HTTP/1.0\r\nContent-Length: {len(data)}\r\n\r\n'.encode() + data
        transport = Transport(wire)
        GatewayHandler(transport, ('127.0.0.1', 1234), self.server)
        header, response = bytes(transport.response).split(b'\r\n\r\n', 1)
        return int(header.split()[1]), json.loads(response)

    def test_one_bounded_request_to_fixed_provider_then_reject_retry(self):
        self.assertEqual(self.call('/health', method='GET'), (200, {'model': self.server.model, 'error': None}))
        status, result = self.call(body={**self.payload, 'api_base': 'https://untrusted.invalid', 'tools': [{'ignored': True}]})
        self.assertEqual(status, 200)
        self.assertIn('[redacted]', result['choices'][0]['message']['content'])
        self.assertNotIn(self.server.api_key, json.dumps(result))
        self.assertEqual(result['usage']['prompt_tokens'], 25)
        request, timeout = self.requests[0]
        self.assertEqual(request.full_url, ENDPOINT)
        self.assertEqual(request.get_header('Authorization'), 'Bearer ' + self.server.api_key)
        sent = json.loads(request.data)
        self.assertNotIn('api_base', sent)
        self.assertNotIn('tools', sent)
        self.assertEqual(sent['provider'], {'allow_fallbacks': False})
        self.assertEqual(sent['reasoning']['effort'], 'low')
        self.assertEqual(timeout, 290)
        self.assertEqual(self.call()[0], 409)
        self.assertEqual(len(self.requests), 1)

    def test_rejects_other_models_streaming_oversized_budgets_and_paths_without_inference(self):
        for change in [{'model': 'other/model'}, {'stream': True}, {'max_tokens': 4097}, {'max_tokens': True}, {'messages': []}]:
            self.assertEqual(self.call(body={**self.payload, **change})[0], 400)
        self.assertEqual(self.call('/forward')[0], 404)
        self.assertEqual(self.requests, [])

    def test_forwards_only_the_canonical_diagnosis_schema(self):
        self.assertEqual(self.call(body={**self.payload, 'response_format': {'type': 'json_object'}})[0], 400)
        self.assertEqual(self.requests, [])
        self.assertEqual(self.call(body={**self.payload, 'response_format': DIAGNOSIS_FORMAT})[0], 200)
        sent = json.loads(self.requests[0][0].data)
        self.assertEqual(sent['response_format'], DIAGNOSIS_FORMAT)
        self.assertTrue(sent['provider']['require_parameters'])

    def test_provider_failure_has_no_secret_and_cannot_trigger_second_inference(self):
        self.fail = True
        status, error = self.call()
        self.assertEqual(status, 401)
        self.assertEqual(error['error'], 'OpenRouter returned HTTP 401.')
        self.assertNotIn(self.server.api_key, json.dumps(error))
        self.assertEqual(self.call('/health', method='GET')[1]['error'], error['error'])
        self.assertEqual(self.call()[0], 409)
        self.assertEqual(len(self.requests), 1)


if __name__ == '__main__':
    unittest.main()
