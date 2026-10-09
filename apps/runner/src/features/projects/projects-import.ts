import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, rename, rm, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import type { Project } from '@vibeguard/contracts';
import { directoryDigest } from '../../lib/directory-digest.js';
import { ApiFailure } from '../../lib/api-errors.js';

export const uploadLimit = 20 * 1024 * 1024;
const expandedLimit = 100 * 1024 * 1024;
const invalid = () =>
  new ApiFailure(
    400,
    'invalid_request',
    'Upload a valid ZIP containing regular project files.',
  );

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Deliberately limited ZIP reader: stored/deflated files, no ZIP64, encryption or links. */
function readZip(zip: Buffer) {
  const files: { name: string; data: Buffer; directory: boolean }[] = [];
  const names = new Set<string>();
  let total = 0;
  let end = zip.length - 22;
  while (
    end >= Math.max(0, zip.length - 65557) &&
    zip.readUInt32LE(end) !== 0x06054b50
  )
    end--;
  if (
    end < 0 ||
    end < zip.length - 65557 ||
    end + 22 + zip.readUInt16LE(end + 20) !== zip.length
  )
    throw invalid();
  const count = zip.readUInt16LE(end + 10);
  if (
    !count ||
    count > 2000 ||
    zip.readUInt16LE(end + 4) ||
    zip.readUInt16LE(end + 6) ||
    zip.readUInt16LE(end + 8) !== count
  )
    throw invalid();
  let offset = zip.readUInt32LE(end + 16);
  if (offset + zip.readUInt32LE(end + 12) !== end) throw invalid();
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || zip.readUInt32LE(offset) !== 0x02014b50)
      throw invalid();
    const flags = zip.readUInt16LE(offset + 8);
    const method = zip.readUInt16LE(offset + 10);
    const compressed = zip.readUInt32LE(offset + 20);
    const size = zip.readUInt32LE(offset + 24);
    const nameLength = zip.readUInt16LE(offset + 28);
    const next =
      offset +
      46 +
      nameLength +
      zip.readUInt16LE(offset + 30) +
      zip.readUInt16LE(offset + 32);
    const nameBytes = zip.subarray(offset + 46, offset + 46 + nameLength);
    const name = nameBytes.toString('utf8');
    const mode = zip.readUInt32LE(offset + 38) >>> 16;
    const directory = name.endsWith('/');
    const path = directory ? name.slice(0, -1) : name;
    if (
      next > end ||
      !Buffer.from(name).equals(nameBytes) ||
      flags & ~0x808 ||
      ![0, 8].includes(method) ||
      zip.readUInt16LE(offset + 34) ||
      (mode & 0xf000 && (mode & 0xf000) !== (directory ? 0x4000 : 0x8000)) ||
      !path ||
      path.length > 240 ||
      /[\\:\x00-\x1f\x7f]/.test(path) ||
      path.split('/').some((p) => !p || p === '.' || p === '..') ||
      names.has(path.toLowerCase())
    )
      throw invalid();
    names.add(path.toLowerCase());
    total += size;
    if (total > expandedLimit || size > expandedLimit) throw invalid();
    const local = zip.readUInt32LE(offset + 42);
    if (
      local + 30 > offset ||
      zip.readUInt32LE(local) !== 0x04034b50 ||
      zip.readUInt16LE(local + 6) !== flags ||
      zip.readUInt16LE(local + 8) !== method
    )
      throw invalid();
    const localNameLength = zip.readUInt16LE(local + 26);
    if (
      !zip.subarray(local + 30, local + 30 + localNameLength).equals(nameBytes)
    )
      throw invalid();
    const start = local + 30 + localNameLength + zip.readUInt16LE(local + 28);
    if (start + compressed > zip.readUInt32LE(end + 16)) throw invalid();
    const payload = zip.subarray(start, start + compressed);
    const data =
      method === 0
        ? payload
        : inflateRawSync(payload, { maxOutputLength: Math.max(1, size) });
    if (
      data.length !== size ||
      crc32(data) !== zip.readUInt32LE(offset + 16) ||
      (directory && size)
    )
      throw invalid();
    files.push({ name: path, data, directory });
    offset = next;
  }
  const filePaths = new Set(
    files
      .filter((file) => !file.directory)
      .map((file) => file.name.toLowerCase()),
  );
  for (const name of names) {
    const parts = name.split('/');
    for (let i = 1; i < parts.length; i++) {
      if (filePaths.has(parts.slice(0, i).join('/'))) throw invalid();
    }
  }
  if (offset !== end || !files.some((file) => !file.directory)) throw invalid();
  return files;
}

export async function importProject(
  workspace: string,
  zip: Buffer,
  name: string,
): Promise<Project> {
  let files;
  try {
    files = readZip(zip);
  } catch {
    throw invalid();
  }
  const id = randomUUID();
  const root = join(workspace, 'projects');
  await mkdir(root, { recursive: true });
  const staging = join(root, `.import-${id}`);
  const original = join(staging, 'original');
  try {
    await mkdir(original, { recursive: true });
    await writeFile(join(staging, 'upload.zip'), zip, {
      flag: 'wx',
      mode: 0o400,
    });
    for (const file of files.sort((a, b) =>
      a.name.localeCompare(b.name, 'en'),
    )) {
      const target = join(original, file.name);
      if (file.directory) {
        await mkdir(target, { recursive: true });
        continue;
      }
      await mkdir(join(target, '..'), { recursive: true });
      await writeFile(target, file.data, { flag: 'wx', mode: 0o400 });
    }
    // Originals are frozen; future operations must create a separate editable copy.
    const directories = new Set([original]);
    for (const file of files) {
      let directory = file.directory
        ? join(original, file.name)
        : join(original, file.name, '..');
      while (directory !== original) {
        directories.add(directory);
        directory = join(directory, '..');
      }
    }
    for (const directory of directories) await chmod(directory, 0o500);
    const project: Project = {
      id,
      name,
      setup: {
        status: 'not_prepared',
        message: 'Project imported. Prepare a separate test copy next.',
        issue: null,
      },
      originalVersion: {
        id: randomUUID(),
        parentVersionId: null,
        kind: 'original',
        contentDigest: await directoryDigest(original, true),
      },
      candidateVersion: null,
      goal: null,
      messages: [],
      previews: [],
      baseline: null,
      latestVerification: null,
      approval: null,
      activeJobId: null,
    };
    await writeFile(join(staging, 'project.json'), JSON.stringify(project), {
      flag: 'wx',
      mode: 0o600,
    });
    await rename(staging, join(root, id));
    return project;
  } catch (error) {
    // Restore directory permissions so rejected imports can be removed.
    for (const file of files) {
      let directory = file.directory
        ? join(original, file.name)
        : join(original, file.name, '..');
      while (directory !== original) {
        await chmod(directory, 0o700).catch(() => {});
        directory = join(directory, '..');
      }
    }
    await chmod(original, 0o700).catch(() => {});
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}
