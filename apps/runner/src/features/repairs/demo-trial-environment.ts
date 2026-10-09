import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ReleaseError } from '../../lib/release-error.js';
import { validateChecks } from '../checks/checks-baseline.js';
import { runProcess } from './repair-process.js';
import type { AiderProfile } from './aider-sandbox.js';

/** Standalone qualification only. Does not replace the preparation owner's adapter.
 * Compose/services/schema come from trusted fixture files, never agent-authored setup. */
export async function startDemoTrialEnvironment(
  input: {
    trustedFixtureDirectory: string;
    targetDirectory: string;
    stateDirectory: string;
    profile: AiderProfile;
    port: number;
    preview?: boolean;
  },
  execute: typeof runProcess = runProcess,
  request: typeof fetch = fetch,
) {
  if (!Number.isInteger(input.port) || input.port < 1024 || input.port > 65535)
    throw new ReleaseError(
      'invalid_request',
      'Choose a valid loopback demo port.',
    );
  const name = `vg-demo-${randomUUID()}`;
  await mkdir(input.stateDirectory, { recursive: true, mode: 0o700 });
  const override = join(input.stateDirectory, 'compose.override.json');
  const uid = String(process.getuid?.() ?? 1000);
  const gid = String(process.getgid?.() ?? 1000);
  const previewConfig = join(input.stateDirectory, 'preview.nginx.conf');
  if (input.preview)
    await writeFile(
      previewConfig,
      `pid /tmp/nginx.pid;
events {}
http {
  access_log /dev/stdout;
  error_log /dev/stderr;
  client_body_temp_path /tmp/client_temp;
  proxy_temp_path /tmp/proxy_temp;
  server {
    listen 8080;
    location / { proxy_pass http://web:8080; }
  }
}
`,
      { mode: 0o600 },
    );
  await writeFile(
    override,
    JSON.stringify({
      services: {
        // PostgREST --ready rejects its default wildcard admin host (!4).
        rest: { environment: { PGRST_ADMIN_SERVER_HOST: '127.0.0.1' } },
        web: {
          volumes: [`${input.targetDirectory}:/usr/share/nginx/html:ro`],
          user: `${uid}:${gid}`,
          // Nginx creates all its default temp directories even without FastCGI.
          tmpfs: [
            `/var/cache/nginx:rw,nosuid,nodev,noexec,size=16m,uid=${uid},gid=${gid},mode=0700`,
          ],
        },
        ...(input.preview
          ? {
              // Only this trusted, fixed-destination proxy joins the host bridge.
              preview: {
                image: 'nginx:1.28-alpine',
                user: `${uid}:${gid}`,
                read_only: true,
                cap_drop: ['ALL'],
                security_opt: ['no-new-privileges:true'],
                pids_limit: 128,
                mem_limit: '128m',
                tmpfs: [
                  '/tmp:rw,nosuid,nodev,noexec,size=16m,mode=1777',
                  `/var/cache/nginx:rw,nosuid,nodev,noexec,size=16m,uid=${uid},gid=${gid},mode=0700`,
                ],
                entrypoint: [
                  'nginx',
                  '-c',
                  '/preview.conf',
                  '-g',
                  'daemon off;',
                ],
                volumes: [`${previewConfig}:/preview.conf:ro`],
                networks: ['default', 'preview'],
                ports: [`127.0.0.1:${input.port}:8080`],
                depends_on: { web: { condition: 'service_healthy' } },
                healthcheck: {
                  test: [
                    'CMD',
                    'wget',
                    '-q',
                    '-O',
                    '/dev/null',
                    'http://127.0.0.1:8080/health',
                  ],
                  interval: '3s',
                  timeout: '3s',
                  retries: 30,
                },
              },
            }
          : {}),
      },
      networks: {
        default: { internal: true },
        ...(input.preview ? { preview: {} } : {}),
      },
    }),
    { mode: 0o600 },
  );
  const args = [
    'compose',
    '--project-directory',
    input.trustedFixtureDirectory,
    '-p',
    name,
    '-f',
    join(input.trustedFixtureDirectory, 'compose.yaml'),
    '-f',
    override,
  ];
  const compose = (extra: string[], timeout: number) =>
    execute('docker', [...args, ...extra], timeout, {
      // Web stays on the internal bridge; the preview proxy owns the public port.
      env: {
        DEMO_PORT: String(input.preview ? 0 : input.port),
        DEMO_UID: uid,
        DEMO_GID: gid,
      },
    });
  const stop = async () => {
    const result = await compose(['down', '-v', '--remove-orphans'], 60_000);
    if (result.exitCode !== 0)
      throw new ReleaseError(
        'setup_incomplete',
        `Trial cleanup failed for ${name}.`,
      );
  };
  await writeFile(
    join(input.stateDirectory, 'environment.json'),
    JSON.stringify({
      name,
      args,
      port: input.port,
      targetDirectory: input.targetDirectory,
    }),
    { mode: 0o600 },
  );
  try {
    const result = await compose(
      [
        'up',
        '-d',
        '--wait',
        '--wait-timeout',
        String(input.profile.startupTimeoutMs / 1000),
        '--pull',
        'never',
      ],
      input.profile.startupTimeoutMs + 30_000,
    );
    await writeFile(
      join(input.stateDirectory, 'startup.json'),
      JSON.stringify(result, null, 2),
      { mode: 0o600 },
    );
    if (result.exitCode !== 0)
      throw new ReleaseError(
        'setup_incomplete',
        `The trial environment did not start. See ${join(input.stateDirectory, 'startup-diagnostics.json')}.`,
      );
    const web = await compose(['ps', '-q', 'web'], 30_000);
    const webId = web.output.trim();
    if (!/^[a-f0-9]{12,64}$/.test(webId))
      throw new ReleaseError(
        'setup_incomplete',
        'Cannot resolve the isolated trial web container.',
      );
    const url = `http://127.0.0.1:${input.port}`;
    if (input.preview) {
      let reachable = false;
      try {
        const response = await request(`${url}/health`, {
          signal: AbortSignal.timeout(5000),
          redirect: 'error',
        });
        reachable = response.ok && (await response.text()) === 'web alive\n';
      } catch {
        // Docker service health alone does not establish host reachability.
      }
      await writeFile(
        join(input.stateDirectory, 'preview-reachability.json'),
        JSON.stringify({ url, reachable }),
        { mode: 0o600 },
      );
      if (!reachable)
        throw new ReleaseError(
          'setup_incomplete',
          `The checked app is healthy but its preview is unreachable at ${url}. See ${join(input.stateDirectory, 'startup-diagnostics.json')}.`,
        );
    }
    return {
      name,
      url,
      stop,
      async check(checksDirectory: string) {
        const container = `vg-verifier-${randomUUID()}`;
        try {
          // Sharing web's network namespace gives the protected client a local URL.
          // The web namespace is on an internal network with only this trial's DB/REST.
          const result = await execute(
            'docker',
            [
              'run',
              '--name',
              container,
              '--pull',
              'never',
              '--user',
              `${uid}:${gid}`,
              '--network',
              `container:${webId}`,
              '--read-only',
              '--cap-drop',
              'ALL',
              '--security-opt',
              'no-new-privileges',
              '--pids-limit',
              '128',
              '--memory',
              '512m',
              '--tmpfs',
              '/tmp:rw,nosuid,nodev,mode=1777',
              '--mount',
              `type=bind,source=${join(input.targetDirectory, 'customers.js')},target=/candidate/customers.js,readonly`,
              '--mount',
              `type=bind,source=${checksDirectory},target=/trusted/verification/demo-crud,readonly`,
              '--mount',
              `type=bind,source=${input.trustedFixtureDirectory},target=/trusted/fixtures/demo-crud/customer-tracker,readonly`,
              '--env',
              'VIBEGUARD_TARGET_DIR=/candidate',
              '--env',
              'VIBEGUARD_DEMO_URL=http://127.0.0.1:8080',
              input.profile.nodeImage,
              'node',
              '/trusted/verification/demo-crud/baseline.mjs',
            ],
            input.profile.testTimeoutMs + 10_000,
          );
          await writeFile(
            join(input.stateDirectory, 'checks-process.json'),
            JSON.stringify(result, null, 2),
            { mode: 0o600 },
          );
          if (![0, 1, 2].includes(result.exitCode ?? -1))
            throw new ReleaseError(
              'check_unavailable',
              'Protected verifier process crashed.',
            );
          let checks;
          try {
            checks = validateChecks(JSON.parse(result.output));
          } catch {
            throw new ReleaseError(
              'check_unavailable',
              'Protected verifier did not return structured evidence.',
            );
          }
          return checks;
        } finally {
          const result = await execute(
            'docker',
            ['rm', '-f', container],
            30_000,
          );
          if (
            result.exitCode !== 0 &&
            !result.output.includes('No such container')
          )
            throw new ReleaseError(
              'check_unavailable',
              'Verifier cleanup failed.',
            );
        }
      },
    };
  } catch (error) {
    // Capture before down removes the containers and their healthcheck output.
    const capture = async (operation: () => ReturnType<typeof runProcess>) => {
      try {
        return await operation();
      } catch (failure) {
        return { error: (failure as Error).message };
      }
    };
    const [logs, rest] = await Promise.all([
      capture(() => compose(['logs', '--no-color', '--tail', '100'], 15_000)),
      capture(() => compose(['ps', '-a', '-q', 'rest'], 15_000)),
    ]);
    const restId = 'output' in rest ? rest.output.trim() : '';
    const health = /^[a-f0-9]{12,64}$/.test(restId)
      ? await capture(() =>
          execute(
            'docker',
            ['inspect', '--format', '{{json .State.Health}}', restId],
            15_000,
          ),
        )
      : undefined;
    try {
      await writeFile(
        join(input.stateDirectory, 'startup-diagnostics.json'),
        JSON.stringify(
          { message: (error as Error).message, logs, rest, health },
          null,
          2,
        ),
        { mode: 0o600 },
      );
    } catch {
      // Evidence storage failure must not prevent container cleanup.
    }
    try {
      await stop();
    } catch (cleanup) {
      await writeFile(
        join(input.stateDirectory, 'cleanup-failure.json'),
        JSON.stringify({ message: (cleanup as Error).message }),
        { mode: 0o600 },
      );
      throw new ReleaseError(
        'setup_incomplete',
        `${(error as Error).message} Cleanup also failed; see cleanup-failure.json.`,
      );
    }
    throw error;
  }
}
