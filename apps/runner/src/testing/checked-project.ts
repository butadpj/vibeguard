import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Project } from '@vibeguard/contracts';
import {
  checkedProjectExample,
  seededDemoProjectId,
} from '@vibeguard/contracts/examples';
import { directoryDigest } from '../lib/directory-digest.js';

// A tiny "app": its check passes only when app.js says FIXED.
const CHECK_SCRIPT = `
import { readFileSync } from 'node:fs';
const code = readFileSync(process.env.VIBEGUARD_TARGET_DIR + '/app.js', 'utf8');
const ok = code.includes('FIXED');
console.log(ok ? 'edit saved' : 'edit did not save');
process.exit(ok ? 0 : 1);
`;
const SCOPES = ['goal', 'create', 'read', 'update', 'delete'] as const;

/** Write a checked project into a runner workspace: a buggy original, a fixed
 * candidate, protected checks, and passing results. Preparation and repair do
 * not produce these yet, so tests and the dashboard demo seed them here. */
export async function seedCheckedProject(home: string): Promise<Project> {
  const root = path.join(home, 'projects', seededDemoProjectId);
  const original = path.join(root, 'versions', 'version_original');
  const candidate = path.join(root, 'versions', 'version_candidate');
  const checks = path.join(root, 'check-sets', 'checks_crud_v1');
  for (const folder of [original, candidate, checks]) {
    await mkdir(folder, { recursive: true });
  }
  await writeFile(path.join(original, 'app.js'), '// BUGGY\n');
  await writeFile(path.join(candidate, 'app.js'), '// FIXED\n');
  await writeFile(
    path.join(candidate, 'docker-compose.yml'),
    'services:\n  web:\n    ports:\n      - "3000:3000"\n',
  );
  await mkdir(path.join(candidate, 'node_modules'));
  await writeFile(path.join(candidate, 'node_modules', 'junk.js'), 'x');
  await writeFile(path.join(candidate, 'data.sqlite'), 'test data');
  await writeFile(path.join(checks, 'crud.mjs'), CHECK_SCRIPT);
  await writeFile(
    path.join(checks, 'checks.json'),
    JSON.stringify(
      SCOPES.map((scope) => ({
        id: `check_${scope}`,
        name: `${scope} check`,
        scope,
        command: 'node',
        args: ['crud.mjs'],
        timeoutMs: 10_000,
      })),
    ),
  );
  const seeded: Project = {
    ...structuredClone(checkedProjectExample),
    id: seededDemoProjectId,
    originalVersion: {
      ...checkedProjectExample.originalVersion,
      contentDigest: await directoryDigest(original),
    },
    candidateVersion: {
      ...checkedProjectExample.candidateVersion,
      contentDigest: await directoryDigest(candidate),
    },
  };
  await writeFile(path.join(root, 'project.json'), JSON.stringify(seeded));
  return seeded;
}
