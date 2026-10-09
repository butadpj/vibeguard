import path from 'node:path';

const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;

/** Runner IDs become folder names, so only accept plain characters. */
export function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID.test(value);
}

export function isInside(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

/** Resolve a path and refuse anything that leaves the managed root. */
export function resolveInside(root: string, ...segments: string[]): string {
  const target = path.resolve(root, ...segments);
  if (!isInside(root, target)) {
    throw new Error('Path leaves the managed VibeGuard folder.');
  }
  return target;
}
