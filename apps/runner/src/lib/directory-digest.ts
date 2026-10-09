import { createHash } from 'node:crypto';
import { cp, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

// Not "the code": dependencies, git history, build output, and the test
// app's own data. Digest and copy use the same rules, so a copy always
// matches its source.
const IGNORED_NAMES = new Set([
  'node_modules',
  '.git',
  '.vibeguard',
  'dist',
  '.DS_Store',
]);
const IGNORED_EXTENSIONS = new Set(['.sqlite', '.sqlite3', '.db', '.log']);

export function isIgnored(filePath: string): boolean {
  const name = path.basename(filePath);
  return (
    IGNORED_NAMES.has(name) ||
    IGNORED_EXTENSIONS.has(path.extname(name).toLowerCase())
  );
}

/** Sorted relative file paths with forward slashes. Symlinks are skipped. */
export async function listFiles(
  root: string,
  relative = '',
  includeIgnored = false,
): Promise<string[]> {
  const entries = await readdir(path.join(root, relative), {
    withFileTypes: true,
  });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const files: string[] = [];
  for (const entry of entries) {
    if (!includeIgnored && isIgnored(entry.name)) continue;
    const next = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory())
      files.push(...(await listFiles(root, next, includeIgnored)));
    else if (entry.isFile()) files.push(next);
  }
  return files;
}

/** SHA-256 over every file's path and contents. Same code, same digest.
 * This is the algorithm behind CodeVersion.contentDigest. */
export async function directoryDigest(
  root: string,
  includeIgnored = false,
): Promise<string> {
  const digest = createHash('sha256');
  const files = (await listFiles(root, '', includeIgnored)).sort((a, b) =>
    a.localeCompare(b, 'en'),
  );
  for (const file of files) {
    const content = await readFile(path.join(root, file));
    digest.update(JSON.stringify([file, content.length]));
    digest.update(content);
  }
  return `sha256:${digest.digest('hex')}`;
}

/** Copy project files, leaving out what directoryDigest ignores. */
export async function copyDirectory(from: string, to: string): Promise<void> {
  await cp(from, to, {
    recursive: true,
    force: false,
    errorOnExist: true,
    filter: (source) => source === from || !isIgnored(source),
  });
}

/** Copy everything, for retained check files. */
export async function copyTree(from: string, to: string): Promise<void> {
  await cp(from, to, { recursive: true, force: false, errorOnExist: true });
}
