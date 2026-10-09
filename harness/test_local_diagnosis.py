"""Local diagnosis contract: schema, bounded inference, and read-only inputs."""
import io
import json
import unittest
from unittest.mock import mock_open, patch
from invoke import diagnose_local

class LocalDiagnosisTest(unittest.TestCase):
    def test_structured_diagnosis_and_rejects_truncation_or_gpu(self):
        profile = {'model': 'qwen2.5-coder:7b', 'contextTokens': 8192, 'outputTokens': 2048,
                   'phaseTimeoutMs': 1000, 'aiderVersion': 'test', 'ollamaVersion': 'test'}
        model = {'name': profile['model'], 'digest': 'synthetic-digest'}
        answer = {'cause': 'Update returns values without saving.', 'evidence': ['customers.js update'], 'affectedFiles': ['customers.js'], 'risks': 'Database failures must remain visible.',
                  'plan': 'Persist before returning.', 'tests': 'Update then fresh read; reject database failure.'}
        data = {'done': True, 'done_reason': 'stop', 'prompt_eval_count': 100, 'eval_count': 80,
                'message': {'content': json.dumps(answer)}}
        running = {'digest': model['digest'], 'size_vram': 0, 'context_length': 8192}
        def get(path):
            self.assertEqual(path, '/api/ps')
            return {'models': [running]}
        def respond(request, timeout):
            body = json.loads(request.data)
            self.assertEqual(request.full_url, 'http://ollama:11434/api/chat')
            self.assertEqual(body['format']['required'], ['cause', 'evidence', 'affectedFiles', 'plan', 'risks', 'tests'])
            self.assertEqual(body['options']['num_gpu'], 0)
            self.assertIn('customers.js', body['messages'][1]['content'])
            return io.BytesIO(json.dumps(data).encode())
        with patch('builtins.open', mock_open(read_data='synthetic source')), patch('urllib.request.urlopen', side_effect=respond):
            result = diagnose_local({'profile': profile, 'prompt': 'Saved edits disappear.'}, model, get, lambda **kwargs: 100)
            plan = json.loads(result['response'])
            self.assertEqual(plan['cause'], answer['cause'])
            self.assertEqual(plan['evidence'], answer['evidence'])
            self.assertEqual(plan['affectedFiles'], answer['affectedFiles'])
            self.assertEqual(result['tooling']['inferenceRequests'], 1)
            data['message']['content'] = 'Malformed diagnosis'
            invalid = diagnose_local({'profile': profile, 'prompt': 'Bug'}, model, get, lambda **kwargs: 100)
            self.assertEqual(invalid['response'], 'Malformed diagnosis')
            data['message']['content'] = json.dumps(answer)
            data['done_reason'] = 'length'
            with self.assertRaisesRegex(RuntimeError, 'output budget'):
                diagnose_local({'profile': profile, 'prompt': 'Bug'}, model, get, lambda **kwargs: 100)
            data['done_reason'] = 'stop'
            running['size_vram'] = 1024
            with self.assertRaisesRegex(RuntimeError, 'CPU inference'):
                diagnose_local({'profile': profile, 'prompt': 'Bug'}, model, get, lambda **kwargs: 100)
            with self.assertRaisesRegex(RuntimeError, 'context budget'):
                diagnose_local({'profile': profile, 'prompt': 'Bug'}, model, get, lambda **kwargs: 9000)

if __name__ == '__main__':
    unittest.main()
