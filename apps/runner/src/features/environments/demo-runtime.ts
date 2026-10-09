import { randomUUID } from 'node:crypto';
import {
  cp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyEditableDirectory } from '../../lib/editable-copy.js';
import { directoryDigest, listFiles } from '../../lib/directory-digest.js';
import { isInside, isSafeId } from '../../lib/confined-path.js';
import { ReleaseError } from '../../lib/release-error.js';
import { runProcess } from '../repairs/repair-process.js';
import {
  validateChecks,
  type BaselineChecks,
} from '../checks/checks-baseline.js';
import type { PrepareEnvironment } from '../projects/projects-prepare.js';
import { createProjectsStore } from '../projects/projects-store.js';
import type { RepairHarness } from '../repairs/repairs-run.js';

const repository = fileURLToPath(new URL('../../../../..', import.meta.url));
const checkSetId = 'customer_crud_v1';
const nodeImage = 'node:22.14.0-bookworm-slim';

/** Docker is an external seam; only the trusted runner invokes it. No uploaded commands. */
export type DockerCommand = (
  args: string[],
  timeoutMs: number,
) => Promise<{ exitCode: number | null; output: string }>;

export function createDemoRuntime(options: {
  workspaceDirectory: string;
  workspaceVolume?: string;
  repositoryDirectory?: string;
  docker?: DockerCommand;
}) {
  const home = resolve(options.workspaceDirectory);
  const repo = options.repositoryDirectory ?? repository;
  const fixture = join(repo, 'fixtures/demo-crud/customer-tracker');
  const protectedSuite = join(repo, 'verification/demo-crud');
  const docker: DockerCommand =
    options.docker ?? ((args, timeout) => runProcess('docker', args, timeout));
  const runtimeRoot = join(home, 'demo-runtime');
  const projects = createProjectsStore(home);
  const uid = String(process.getuid?.() ?? 1000);
  const gid = String(process.getgid?.() ?? 1000);

  async function command(args: string[], timeout = 60_000) {
    const result = await docker(args, timeout);
    if (result.exitCode !== 0) {
      const diagnostics = join(home, 'demo-diagnostics');
      await mkdir(diagnostics, { recursive: true, mode: 0o700 });
      await managed(diagnostics);
      const id = randomUUID();
      let logs: { exitCode: number | null; output: string } | null = null;
      if (args[0] === 'compose' && args.includes('up')) {
        const prefix = args.slice(0, args.indexOf('up'));
        logs = await docker(
          [...prefix, 'logs', '--no-color', '--tail', '100'],
          15_000,
        ).catch(() => null);
      }
      // Keep raw Docker output private and outside disposable environment cleanup.
      await writeFile(
        join(diagnostics, `${id}.json`),
        JSON.stringify({ args, ...result, logs }, null, 2),
        { mode: 0o600 },
      );
      const operation =
        args[0] === 'pull'
          ? 'image download'
          : args[0] === 'volume'
            ? 'workspace volume lookup'
            : args.includes('up')
              ? 'app and database startup'
              : args.includes('down')
                ? 'environment cleanup'
                : 'container lookup';
      throw new ReleaseError(
        'setup_incomplete',
        `Docker failed during ${operation}.`,
        `Read demo-diagnostics/${id}.json inside the runner workspace for the Docker error.`,
      );
    }
    return result.output.trim();
  }
  async function managed(path: string) {
    if (
      !isInside(home, path) ||
      (await realpath(path)) !==
        resolve(await realpath(home), relative(home, path))
    )
      throw new ReleaseError(
        'invalid_request',
        'Demo storage must stay inside the runner workspace.',
      );
    return path;
  }
  async function storageMount(path: string, target: string) {
    await managed(path);
    if (!options.workspaceVolume)
      return {
        type: 'bind',
        source: path,
        target,
        read_only: true,
        bind: { create_host_path: false },
      };
    if (!isSafeId(options.workspaceVolume))
      throw new ReleaseError(
        'setup_incomplete',
        'Invalid runner volume configuration.',
      );
    // Docker Desktop cannot safely reuse a volume Mountpoint as a host bind path.
    return {
      type: 'volume',
      source: 'workspace',
      target,
      read_only: true,
      volume: { nocopy: true, subpath: relative(home, path) },
    };
  }
  async function verifierMount(path: string, target: string) {
    const mount = await storageMount(path, target);
    return mount.type === 'volume'
      ? `type=volume,source=${options.workspaceVolume},target=${target},readonly,volume-nocopy,volume-subpath=${mount.volume!.subpath}`
      : `type=bind,source=${mount.source},target=${target},readonly`;
  }
  async function supported(target: string) {
    const expected = await listFiles(fixture, '', true);
    const actual = await listFiles(target, '', true);
    // Only the demo's business logic and its supplemental regression test may differ.
    if (
      actual.some(
        (file) => !expected.includes(file) && file !== 'customers.test.mjs',
      ) ||
      expected.some((file) => !actual.includes(file))
    )
      throw new ReleaseError(
        'unsupported_setup',
        'Use the supplied customer-tracker ZIP for this demo.',
      );
    for (const file of expected) {
      if (file === 'customers.js') continue;
      if (
        !(await readFile(join(target, file))).equals(
          await readFile(join(fixture, file)),
        )
      )
        throw new ReleaseError(
          'unsupported_setup',
          'The demo setup differs from the reviewed customer-tracker fixture.',
        );
    }
  }
  async function installChecks(projectId: string) {
    if (!isSafeId(projectId))
      throw new ReleaseError('invalid_request', 'Invalid project.');
    const root = join(home, 'projects', projectId);
    await managed(root);
    const sets = join(root, 'check-sets');
    await mkdir(sets, { recursive: true, mode: 0o700 });
    await managed(sets);
    const destination = join(sets, checkSetId);
    // Publish once; never silently replace a suite that already binds evidence.
    try {
      await mkdir(destination, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      await managed(destination);
      if (
        !(await readFile(join(destination, 'baseline.mjs'))).equals(
          await readFile(join(protectedSuite, 'baseline.mjs')),
        ) ||
        (await directoryDigest(join(destination, 'trusted-fixture'), true)) !==
          (await directoryDigest(fixture, true))
      )
        throw new ReleaseError(
          'version_mismatch',
          'The protected demo suite changed. Import the demo again.',
        );
      return;
    }
    await cp(protectedSuite, destination, {
      recursive: true,
      dereference: false,
    });
    // Include the SDK and helper bytes in the suite digest, not just its entry point.
    await copyEditableDirectory(fixture, join(destination, 'trusted-fixture'));
  }
  async function start(target: string, downloads: boolean) {
    await supported(target);
    await mkdir(runtimeRoot, { recursive: true, mode: 0o700 });
    await managed(runtimeRoot);
    const name = `vg-demo-${randomUUID()}`;
    const state = join(runtimeRoot, name);
    await mkdir(state, { mode: 0o700 });
    const trusted = join(state, 'trusted');
    const app = join(state, 'app');
    await copyEditableDirectory(fixture, trusted);
    await copyEditableDirectory(target, app);
    const config = join(state, 'compose.json');
    // Compose accepts JSON. All commands/services/schema are runner-authored.
    // Importing an app never executes its Compose file, package scripts or nginx config.
    const security = {
      cap_drop: ['ALL'],
      security_opt: ['no-new-privileges:true'],
    };
    await writeFile(
      config,
      JSON.stringify({
        services: {
          db: {
            image: 'supabase/postgres:17.6.1.136',
            environment: {
              POSTGRES_PASSWORD: 'synthetic-demo-postgres',
              POSTGRES_DB: 'postgres',
              JWT_SECRET: 'synthetic-demo-jwt-secret-not-for-production-2026',
              JWT_EXP: '3600',
            },
            volumes: ['data:/var/lib/postgresql/data'],
            healthcheck: {
              test: ['CMD', 'pg_isready', '-U', 'postgres', '-h', '127.0.0.1'],
              interval: '3s',
              timeout: '3s',
              retries: 40,
            },
          },
          schema: {
            image: 'supabase/postgres:17.6.1.136',
            user: '0:0',
            depends_on: { db: { condition: 'service_healthy' } },
            environment: { PGPASSWORD: 'synthetic-demo-postgres' },
            entrypoint: ['psql'],
            command: [
              '-h',
              'db',
              '-U',
              'postgres',
              '-d',
              'postgres',
              '-v',
              'ON_ERROR_STOP=1',
              '-f',
              '/schema/schema.sql',
            ],
            volumes: [await storageMount(join(trusted, 'database'), '/schema')],
          },
          rest: {
            image: 'postgrest/postgrest:v14.17',
            depends_on: {
              schema: { condition: 'service_completed_successfully' },
            },
            environment: {
              PGRST_DB_URI:
                'postgres://customer_demo_api:synthetic-demo-api@db:5432/postgres',
              PGRST_DB_SCHEMAS: 'public',
              PGRST_DB_ANON_ROLE: 'customer_demo_anon',
              PGRST_JWT_SECRET:
                'synthetic-demo-jwt-secret-not-for-production-2026',
              PGRST_ADMIN_SERVER_PORT: '3001',
              // --ready cannot connect to PostgREST's default wildcard admin host.
              PGRST_ADMIN_SERVER_HOST: '127.0.0.1',
            },
            healthcheck: {
              test: ['CMD', 'postgrest', '--ready'],
              interval: '3s',
              timeout: '3s',
              retries: 40,
            },
          },
          web: {
            image: 'nginx:1.28-alpine',
            ...security,
            user: `${uid}:${gid}`,
            read_only: true,
            // Nginx initializes its default cache paths even when only proxying.
            tmpfs: [
              '/tmp:rw,nosuid,nodev,mode=1777',
              `/var/cache/nginx:rw,nosuid,nodev,noexec,size=16m,uid=${uid},gid=${gid},mode=0700`,
            ],
            entrypoint: [
              'nginx',
              '-c',
              '/usr/share/nginx/html/nginx.conf',
              '-g',
              // Root with dropped capabilities cannot switch users or chown temp files.
              uid === '0'
                ? 'user root; master_process off; daemon off;'
                : 'daemon off;',
            ],
            depends_on: { rest: { condition: 'service_healthy' } },
            // shortcut: web and its verifier can reach the internet; restore isolated checks before offline acceptance.
            networks: ['default', 'preview'],
            ports: ['127.0.0.1::8080'],
            volumes: [await storageMount(app, '/usr/share/nginx/html')],
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
              retries: 40,
            },
          },
        },
        networks: { default: { internal: true }, preview: {} },
        volumes: {
          data: {},
          ...(options.workspaceVolume
            ? { workspace: { external: true, name: options.workspaceVolume } }
            : {}),
        },
      }),
      { mode: 0o600 },
    );
    const args = ['compose', '-p', name, '-f', config];
    let stopped = false;
    const stop = async () => {
      if (stopped) return;
      await command([...args, 'down', '-v', '--remove-orphans']);
      stopped = true;
      await rm(state, { recursive: true, force: true });
    };
    try {
      // Downloads only occur during preparation; checks require cached images.
      if (downloads) {
        for (const image of [
          'supabase/postgres:17.6.1.136',
          'postgrest/postgrest:v14.17',
          'nginx:1.28-alpine',
          nodeImage,
        ]) {
          const cached = await docker(
            ['image', 'inspect', image, '--format', '{{.Id}}'],
            30_000,
          );
          if (cached.exitCode !== 0) await command(['pull', image], 600_000);
        }
      }
      await command(
        [
          ...args,
          'up',
          '-d',
          '--wait',
          '--wait-timeout',
          '180',
          '--pull',
          'never',
        ],
        210_000,
      );
      const web = await command([...args, 'ps', '-q', 'web'], 30_000);
      if (!/^[a-f0-9]{12,64}$/.test(web))
        throw new ReleaseError(
          'setup_incomplete',
          'The demo web container is unavailable.',
        );
      const published = await command([...args, 'port', 'web', '8080'], 30_000);
      if (!/^127\.0\.0\.1:\d{1,5}$/.test(published))
        throw new ReleaseError(
          'setup_incomplete',
          'The demo preview must bind only to loopback.',
        );
      const execute = async (
        entry: 'health' | 'baseline',
        checksDirectory?: string,
      ) => {
        const container = `vg-check-${randomUUID()}`;
        const mounts = [
          '--mount',
          await verifierMount(app, '/candidate'),
          '--mount',
          await verifierMount(
            checksDirectory
              ? join(checksDirectory, 'trusted-fixture')
              : trusted,
            '/trusted/fixtures/demo-crud/customer-tracker',
          ),
        ];
        if (checksDirectory)
          mounts.push(
            '--mount',
            await verifierMount(
              checksDirectory,
              '/trusted/verification/demo-crud',
            ),
          );
        try {
          const result = await docker(
            [
              'run',
              '--name',
              container,
              '--pull',
              'never',
              '--user',
              `${uid}:${gid}`,
              '--network',
              `container:${web}`,
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
              ...mounts,
              '--env',
              'VIBEGUARD_TARGET_DIR=/candidate',
              '--env',
              'VIBEGUARD_DEMO_URL=http://127.0.0.1:8080',
              nodeImage,
              'node',
              entry === 'baseline'
                ? '/trusted/verification/demo-crud/baseline.mjs'
                : '/trusted/fixtures/demo-crud/customer-tracker/scripts/health.mjs',
            ],
            75_000,
          );
          if (entry === 'health') {
            if (result.exitCode !== 0)
              throw new ReleaseError(
                'setup_incomplete',
                'The demo app and saved data did not pass readiness checks.',
              );
            return [];
          }
          if (![0, 1, 2].includes(result.exitCode ?? -1))
            throw new ReleaseError(
              'check_unavailable',
              'The protected integration process could not finish.',
            );
          let checks;
          try {
            checks = validateChecks(JSON.parse(result.output));
          } catch {
            throw new ReleaseError(
              'check_unavailable',
              'The protected integration process returned invalid evidence.',
            );
          }
          const exit = checks.some(
            (check) => check.verdict === 'could_not_check',
          )
            ? 2
            : checks.some((check) => check.verdict === 'failed')
              ? 1
              : 0;
          if (result.exitCode !== exit)
            throw new ReleaseError(
              'check_unavailable',
              'Verifier exit status disagrees with its evidence.',
            );
          return checks;
        } finally {
          const cleanup = await docker(['rm', '-f', container], 30_000);
          if (
            cleanup.exitCode !== 0 &&
            !cleanup.output.includes('No such container')
          )
            throw new ReleaseError(
              'check_unavailable',
              'The verifier container could not be removed.',
            );
        }
      };
      return { name, url: `http://${published}`, stop, execute };
    } catch (error) {
      await stop();
      throw error;
    }
  }
  const previews = new Map<string, Awaited<ReturnType<typeof start>>>();
  const candidates = new Map<string, Awaited<ReturnType<typeof start>>>();
  const candidatePreview: RepairHarness['preview'] = async (input) => {
    const previous = candidates.get(input.projectId);
    if (previous) {
      await previous.stop();
      candidates.delete(input.projectId);
    }
    const environment = await start(input.workingDirectory, false);
    try {
      await environment.execute('health');
    } catch (error) {
      await environment.stop();
      throw error;
    }
    candidates.set(input.projectId, environment);
    return {
      environmentId: environment.name,
      versionId: input.versionId,
      url: environment.url,
    };
  };
  const prepareEnvironment: PrepareEnvironment = async (input) => {
    try {
      await supported(input.workingDirectory);
    } catch (error) {
      if (error instanceof ReleaseError && error.code === 'unsupported_setup')
        return {
          setup: {
            status: 'unsupported',
            message: error.message,
            issue: {
              code: error.code,
              message: error.message,
              nextStep: 'Import fixtures/demo-crud/customer-tracker.zip.',
            },
          },
          previews: [],
        };
      throw error;
    }
    await installChecks(input.projectId);
    const previous = previews.get(input.projectId);
    if (previous) {
      await previous.stop();
      previews.delete(input.projectId);
    }
    const candidate = candidates.get(input.projectId);
    if (candidate) {
      await candidate.stop();
      candidates.delete(input.projectId);
    }
    const environment = await start(input.workingDirectory, true);
    try {
      await environment.execute('health');
    } catch (error) {
      await environment.stop();
      throw error;
    }
    previews.set(input.projectId, environment);
    return {
      setup: {
        status: 'ready',
        message: 'The customer tracker and its local database are ready.',
        issue: null,
      },
      previews: [
        {
          environmentId: input.environmentId,
          versionId: input.versionId,
          url: environment.url,
        },
      ],
    };
  };
  const baselineChecks: BaselineChecks = {
    checkSetId,
    async run(input) {
      const environment = await start(input.targetDirectory, false);
      try {
        const checks = await environment.execute(
          'baseline',
          input.checksDirectory,
        );
        // This fixture's suite proves one agreed behavior, not arbitrary founder text.
        if (
          input.goal.performance !== null ||
          input.goal.expectedBehavior.trim() !==
            'Saved customer edits survive refreshing.'
        ) {
          const goal = checks.find((check) => check.scope === 'goal')!;
          goal.verdict = 'could_not_check';
          goal.explanation =
            'This demo suite covers saved customer edits after refresh. The confirmed goal needs a matching protected check.';
          goal.evidence = [
            {
              id: 'goal_scope',
              kind: 'observation',
              summary: goal.explanation,
              artifactId: null,
              durationMs: null,
            },
          ];
        }
        return checks;
      } finally {
        await environment.stop();
      }
    },
  };
  async function invalidatePreview(projectId: string) {
    await projects.update(projectId, (project) => ({
      ...project,
      setup: {
        status: 'incomplete',
        message: 'Prepare the test app again after the runner restarts.',
        issue: {
          code: 'setup_incomplete',
          message: 'The previous preview is no longer active.',
          nextStep: 'Prepare the test app again.',
        },
      },
      previews: [],
    }));
  }
  return {
    prepareEnvironment,
    baselineChecks,
    candidatePreview,
    async initialize() {
      await mkdir(runtimeRoot, { recursive: true, mode: 0o700 });
      await managed(runtimeRoot);
      // Disposable app environments may outlive a killed runner. Remove only our recorded stacks.
      for (const entry of await readdir(runtimeRoot, { withFileTypes: true })) {
        if (!entry.isDirectory() || !/^vg-demo-[a-f0-9-]{36}$/.test(entry.name))
          continue;
        const state = join(runtimeRoot, entry.name);
        await managed(state);
        const config = join(state, 'compose.json');
        try {
          await managed(config);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            await rm(state, { recursive: true, force: true });
            continue;
          }
          throw error;
        }
        await command([
          'compose',
          '-p',
          entry.name,
          '-f',
          config,
          'down',
          '-v',
          '--remove-orphans',
        ]);
        await rm(state, { recursive: true, force: true });
      }
      const root = join(home, 'projects');
      await mkdir(root, { recursive: true, mode: 0o700 });
      await managed(root);
      for (const entry of await readdir(root, { withFileTypes: true })) {
        if (!entry.isDirectory() || !isSafeId(entry.name)) continue;
        const project = await projects.require(entry.name);
        if (
          project.setup.status === 'ready' ||
          project.setup.status === 'preparing' ||
          project.previews.length
        )
          await invalidatePreview(project.id);
      }
    },
    async close() {
      for (const environment of candidates.values()) await environment.stop();
      candidates.clear();
      for (const [projectId, environment] of previews) {
        await environment.stop();
        await invalidatePreview(projectId);
      }
      previews.clear();
    },
  };
}
