// Development only: reset the checked demo project in the runner workspace so
// the dashboard can exercise approval, export, and retained checks.
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { seededDemoProjectId } from '@vibeguard/contracts/examples';
import { readConfig } from '../config.js';
import { seedCheckedProject } from './checked-project.js';

const { workspaceDirectory } = readConfig();
await rm(path.join(workspaceDirectory, 'projects', seededDemoProjectId), {
  recursive: true,
  force: true,
});
const project = await seedCheckedProject(workspaceDirectory);
console.log(`Seeded demo project ${project.id} in ${workspaceDirectory}`);
