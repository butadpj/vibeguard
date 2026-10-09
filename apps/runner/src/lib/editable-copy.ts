import { chmod, cp, lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ReleaseError } from './release-error.js';

/** Preserve imported bytes in a separate copy; never follow project links. */
export async function copyEditableDirectory(
  source: string,
  destination: string,
) {
  await cp(source, destination, {
    recursive: true,
    force: false,
    errorOnExist: true,
    filter: async (file) => {
      if ((await lstat(file)).isSymbolicLink())
        throw new ReleaseError(
          'invalid_request',
          'Project files must not contain symbolic links.',
        );
      return true;
    },
  });
  async function unlock(directory: string) {
    await chmod(directory, 0o700);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) await unlock(file);
      else await chmod(file, 0o600);
    }
  }
  await unlock(destination);
}
