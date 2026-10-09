"""Pinned Aider entry point: a phase may make exactly one completion request."""
import json
import os
import sys
import socket
import time
import urllib.request

def invoke(spec):
    import aider
    from aider.coders.base_coder import Coder
    from aider.llm import litellm
    from aider.main import main

    litellm.disable_hf_tokenizer_download = True

    profile = spec['profile']
    cloud = profile.get('provider') == 'openrouter'
    if aider.__version__ != profile['aiderVersion']:
        raise RuntimeError('Aider version differs from the runner profile')
    # Verify enforcement before inference; never truncate the probe files.
    for file in ['app.js', 'client.js', 'compose.yaml']:
        try:
            descriptor = os.open('/app/' + file, os.O_WRONLY)
        except OSError:
            pass
        else:
            os.close(descriptor)
            raise RuntimeError('Protected app files are writable')
    if spec['phase'] == 'diagnosis':
        try:
            descriptor = os.open('/app/customers.js', os.O_WRONLY)
        except OSError:
            pass
        else:
            os.close(descriptor)
            raise RuntimeError('Diagnosis source is writable')
    if os.path.exists('/var/run/docker.sock'):
        raise RuntimeError('Agent received a Docker socket')
    try:
        connection = socket.create_connection(('1.1.1.1', 443), timeout=2)
    except OSError:
        pass
    else:
        connection.close()
        raise RuntimeError('Agent can access an external network')
    if cloud and os.environ.get('OPENROUTER_API_KEY') != 'gateway-only':
        raise RuntimeError('Aider must receive only the gateway placeholder key')
    deadline = time.monotonic() + profile['startupTimeoutMs'] / 1000
    base = 'http://provider:8000' if cloud else 'http://ollama:11434'
    def get(path):
        with urllib.request.urlopen(base + path, timeout=5) as response:
            return json.load(response)
    while True:
        try:
            ready = get('/health' if cloud else '/api/version')
            version = None if cloud else ready['version']
            break
        except (OSError, KeyError):
            if time.monotonic() >= deadline:
                raise RuntimeError('The inference service did not become ready')
            time.sleep(1)
    if not cloud and version != profile['ollamaVersion']:
        raise RuntimeError('Ollama version differs from the runner profile')
    model = {'name': profile['model'], 'digest': None} if cloud else next((item for item in get('/api/tags')['models'] if item['name'] == profile['model']), None)
    if not model or (not cloud and not model.get('digest')):
        raise RuntimeError('The configured model is unavailable offline')
    if spec.get('expectedModelDigest') and model['digest'] != spec['expectedModelDigest']:
        raise RuntimeError('The model digest differs from the runner profile')
    if cloud and ready.get('model') != profile['model']:
        raise RuntimeError('Cloud gateway model differs from the runner profile')
    provider = 'openrouter' if cloud else 'ollama_chat'
    name = provider + '/' + profile['model']
    settings = [{'name': name, 'edit_format': profile['editFormat'], 'use_repo_map': False,
                 'extra_params': {'max_tokens': profile['outputTokens'], 'num_retries': 0}}]
    if not cloud:
        settings[0]['extra_params'].update(num_ctx=profile['contextTokens'], num_gpu=0)
    metadata = {name: {'max_tokens': profile['contextTokens'],
                       'max_input_tokens': profile['contextTokens'] - profile['outputTokens'],
                       'max_output_tokens': profile['outputTokens'], 'input_cost_per_token': 0,
                       'output_cost_per_token': 0, 'litellm_provider': provider, 'mode': 'chat'}}
    for file, value in [('settings.json', settings), ('metadata.json', metadata)]:
        with open('/tmp/' + file, 'w') as stream:
            json.dump(value, stream)
    with open('/tmp/message.txt', 'w') as stream:
        stream.write(spec['prompt'])
    with open('/tmp/empty.yml', 'w') as stream:
        stream.write('{}')
    open('/tmp/empty.env', 'w').close()
    Coder.max_reflections = 0
    original = litellm.completion
    count = 0
    captured = ''
    tokens = None
    running = None
    usage = None
    reported_model = None
    response_id = None
    def single_completion(*args, **kwargs):
        nonlocal count, captured, tokens, running, usage, reported_model, response_id
        if count:
            raise RuntimeError('Automatic inference retries and reflections are disabled')
        count += 1
        # Aider's local token estimate is a conservative gate, not a Qwen tokenizer proof.
        tokens = litellm.token_counter(model=name, messages=kwargs['messages'])
        if tokens > profile['contextTokens'] - profile['outputTokens']:
            raise RuntimeError('Input exceeds the profile context budget')
        kwargs.update(stream=False, max_tokens=profile['outputTokens'], num_retries=0)
        if cloud:
            kwargs.update(api_base=base + '/v1', api_key='gateway-only')
        else:
            kwargs.update(num_ctx=profile['contextTokens'], num_gpu=0)
        response = original(*args, **kwargs)
        reported_model = response.model
        response_id = response.id
        usage = response.usage.model_dump()
        if usage.get('prompt_tokens', profile['contextTokens']) > profile['contextTokens'] - profile['outputTokens'] or usage.get('completion_tokens', profile['outputTokens'] + 1) > profile['outputTokens']:
            raise RuntimeError('Observed token usage exceeds the bounded input/output profile')
        captured = response.choices[0].message.content or ''
        if not cloud:
            running = next((item for item in get('/api/ps')['models'] if item.get('digest') == model['digest']), None)
            if not running or running.get('size_vram') != 0 or running.get('context_length') != profile['contextTokens']:
                raise RuntimeError('Loaded model did not prove CPU inference and the configured context')
        return response
    litellm.completion = single_completion
    args = ['--model', name, '--edit-format', 'ask' if spec['phase'] == 'diagnosis' else profile['editFormat'],
            '--config', '/tmp/empty.yml', '--env-file', '/tmp/empty.env',
            '--model-settings-file', '/tmp/settings.json', '--model-metadata-file', '/tmp/metadata.json',
            '--message-file', '/tmp/message.txt', '--timeout', str(profile['phaseTimeoutMs'] // 1000),
            '--no-git', '--no-auto-commits', '--no-dirty-commits', '--no-auto-lint', '--no-auto-test',
            '--analytics-disable', '--no-check-update', '--no-show-release-notes', '--no-suggest-shell-commands',
            '--no-detect-urls', '--no-notifications', '--no-stream', '--no-pretty', '--no-fancy-input', '--yes-always',
            '--map-tokens', '0', '--input-history-file', '/tmp/input', '--chat-history-file', '/tmp/chat',
            '--llm-history-file', '/tmp/llm']
    for file in ['app.js', 'client.js', 'customers.js']:
        args += ['--file' if spec['phase'] == 'edit' and file == 'customers.js' else '--read', '/app/' + file]
    if spec['phase'] == 'edit':
        args += ['--file', '/app/customers.test.mjs']
    try:
        result = main(args)
        if result or count != 1 or not captured:
            raise RuntimeError('Aider did not complete one model response')
    finally:
        cloud_status = {}
        if cloud:
            try:
                cloud_status = get('/health')
            except (OSError, ValueError):
                pass
        print('VIBEGUARD_RESPONSE=' + json.dumps({'response': captured, 'tooling': {
            'aiderVersion': aider.__version__, 'ollamaVersion': version, 'model': model['name'],
            'provider': 'openrouter' if cloud else 'ollama', 'cloudDebug': cloud,
            'reportedModel': reported_model, 'responseId': response_id,
            'providerError': cloud_status.get('error'),
            'modelDigest': model['digest'], 'inferenceRequests': count, 'estimatedInputTokens': tokens,
            'contextTokens': profile['contextTokens'], 'outputTokens': profile['outputTokens'], 'numGpu': None if cloud else 0,
            'runningModel': running, 'protectedFilesReadOnly': True, 'dockerSocketAbsent': True,
            'externalConnectionBlocked': True, 'usage': usage}}))

if __name__ == '__main__':
    invoke(json.load(sys.stdin))
