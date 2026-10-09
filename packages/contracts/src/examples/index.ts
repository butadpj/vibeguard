/** Synthetic fixtures for development. These are not observed repair results. */
import type {
  Approval,
  ApproveFixRequest,
  CodeVersion,
  ConfirmGoalRequest,
  ErrorResponse,
  ExportArtifact,
  ExportProjectRequest,
  RecheckRequest,
  Goal,
  HealthResponse,
  Job,
  JobAccepted,
  Project,
  RepairRequest,
  RepairResult,
  RunChecksRequest,
  SendMessageRequest,
  VerificationResult,
} from '../index.js';

export const healthExample = {
  status: 'ok',
  service: 'vibeguard-runner',
} satisfies HealthResponse;
const original = {
  id: 'version_original',
  parentVersionId: null,
  kind: 'original',
  contentDigest: 'mock-original-digest',
} satisfies CodeVersion;
const candidate = {
  id: 'version_candidate',
  parentVersionId: original.id,
  kind: 'candidate',
  contentDigest: 'mock-candidate-digest',
} satisfies CodeVersion;
const draft = {
  description: 'Editing a task should persist after reload.',
  expectedBehavior: 'Rename a saved task, reload, and see the new name.',
  performance: null,
};
export const proposedGoalExample = {
  ...draft,
  status: 'proposed',
  revisionId: 'goal_proposed',
} satisfies Goal;
export const confirmedGoalExample = {
  ...draft,
  status: 'confirmed',
  revisionId: 'goal_confirmed',
} satisfies Goal;
export const baselineExample = {
  id: 'verification_baseline',
  projectId: 'project_demo',
  versionId: original.id,
  goalRevisionId: confirmedGoalExample.revisionId,
  checkSetId: 'checks_crud_v1',
  verdict: 'failed',
  checks: [
    {
      id: 'check_goal',
      name: 'Edited task survives reload',
      scope: 'goal',
      verdict: 'failed',
      explanation: 'Reload restored the old task name.',
      evidence: [
        {
          id: 'evidence_reload',
          kind: 'observation',
          summary: 'Expected New name; observed Old name.',
          artifactId: null,
          durationMs: null,
        },
      ],
    },
    ...(['create', 'read', 'update', 'delete'] as const).map((scope) => ({
      id: `check_${scope}`,
      name: `${scope} saved tasks`,
      scope,
      verdict: scope === 'update' ? ('failed' as const) : ('passed' as const),
      explanation:
        scope === 'update'
          ? 'The database retained the old name.'
          : 'Observed the expected persisted database state.',
      evidence: [
        {
          id: `evidence_${scope}`,
          kind: 'observation' as const,
          summary:
            scope === 'update'
              ? 'Stored name did not change.'
              : 'Checked real test database state.',
          artifactId: null,
          durationMs: null,
        },
      ],
    })),
  ],
} satisfies VerificationResult;
export const checkedVerificationExample = {
  ...baselineExample,
  id: 'verification_fixed',
  versionId: candidate.id,
  verdict: 'passed',
  checks: baselineExample.checks.map((check) => ({
    ...check,
    verdict: 'passed' as const,
    explanation: 'Observed expected behavior and persisted test data.',
    evidence: [
      {
        id: `fixed_${check.id}`,
        kind: 'observation' as const,
        summary: 'Observed expected state after reload.',
        artifactId: null,
        durationMs: null,
      },
    ],
  })),
} satisfies VerificationResult;
export const approvalExample = {
  id: 'approval_demo',
  projectId: 'project_demo',
  versionId: candidate.id,
  goalRevisionId: confirmedGoalExample.revisionId,
  verificationId: checkedVerificationExample.id,
} satisfies Approval;
export const exportSavedExample = {
  id: 'artifact_export',
  approvalId: approvalExample.id,
  versionId: candidate.id,
  format: 'zip',
  displayName: 'Task app checked.zip',
  downloadUrl: '/api/artifacts/artifact_export/download',
  savedLocation: 'VibeGuard exports/Task app checked.zip',
} satisfies ExportArtifact;

export const setupIncompleteExample = {
  id: 'project_demo',
  name: 'Task app',
  setup: {
    status: 'incomplete',
    message: 'The test database could not start.',
    issue: {
      code: 'setup_incomplete',
      message: 'Docker is unavailable.',
      nextStep: 'Start Docker and try preparation again.',
    },
  },
  originalVersion: original,
  candidateVersion: null,
  goal: null,
  messages: [],
  previews: [],
  baseline: null,
  latestVerification: null,
  approval: null,
  activeJobId: null,
} satisfies Project;
export const projectReadyExample = {
  ...setupIncompleteExample,
  setup: {
    status: 'ready',
    message: 'The app and test database are running.',
    issue: null,
  },
  previews: [
    {
      environmentId: 'environment_original',
      versionId: original.id,
      url: 'http://127.0.0.1:4401',
    },
  ],
} satisfies Project;
export const importedProjectExample = {
  ...setupIncompleteExample,
  setup: {
    status: 'not_prepared',
    message: 'Project imported. Prepare its test environment next.',
    issue: null,
  },
} satisfies Project;
export const baselineFailedProjectExample = {
  ...projectReadyExample,
  goal: confirmedGoalExample,
  baseline: baselineExample,
  latestVerification: baselineExample,
} satisfies Project;
export const repairCheckedExample = {
  outcome: 'checked',
  baselineVerificationId: baselineExample.id,
  candidateVersion: candidate,
  verification: checkedVerificationExample,
  summary: 'Updated the task persistence handler.',
  diffArtifactId: 'artifact_diff',
  attempts: [
    {
      number: 1,
      sourceVersionId: original.id,
      candidateVersionId: candidate.id,
      verificationId: checkedVerificationExample.id,
      issue: null,
    },
  ],
} satisfies RepairResult;
export const repairUnsuccessfulExample = {
  outcome: 'no_verified_fix',
  baselineVerificationId: baselineExample.id,
  candidateVersion: null,
  verification: null,
  summary: 'Neither attempt produced a checked fix.',
  diffArtifactId: null,
  attempts: ([1, 2] as const).map((number) => ({
    number,
    sourceVersionId: original.id,
    candidateVersionId: null,
    verificationId: null,
    issue: {
      code: 'timeout' as const,
      message: 'The repair attempt timed out.',
      nextStep: 'Review the goal before starting another repair job.',
    },
  })),
} satisfies RepairResult;
export const checkedProjectExample = {
  ...baselineFailedProjectExample,
  candidateVersion: candidate,
  latestVerification: checkedVerificationExample,
  previews: [
    ...projectReadyExample.previews,
    {
      environmentId: 'environment_candidate',
      versionId: candidate.id,
      url: 'http://127.0.0.1:4402',
    },
  ],
} satisfies Project;

const jobBase = {
  id: 'job_demo',
  projectId: 'project_demo',
  goalRevisionId: confirmedGoalExample.revisionId,
  versionId: original.id,
  repairAttempts: [],
};
export const acceptedJobExample = { jobId: jobBase.id } satisfies JobAccepted;
export const preparingJobExample = {
  ...jobBase,
  operation: 'prepare',
  status: 'running',
  goalRevisionId: null,
  progress: { step: 'preparing', message: 'Starting the test database.' },
  result: null,
  error: null,
} satisfies Job<'prepare'>;
export const preparedJobExample = {
  ...jobBase,
  operation: 'prepare',
  status: 'succeeded',
  goalRevisionId: null,
  progress: { step: 'finished', message: 'Your test app is ready.' },
  error: null,
  result: {
    setup: projectReadyExample.setup,
    previews: projectReadyExample.previews,
  },
} satisfies Job<'prepare'>;
export const conversationJobExample = {
  ...jobBase,
  operation: 'message',
  status: 'succeeded',
  goalRevisionId: null,
  progress: { step: 'finished', message: 'Review the proposed goal.' },
  error: null,
  result: {
    reply: {
      id: 'message_reply',
      role: 'assistant',
      text: 'Should the new task name remain after reloading?',
    },
    proposedGoal: proposedGoalExample,
  },
} satisfies Job<'message'>;
export const baselineJobExample = {
  ...jobBase,
  operation: 'check',
  status: 'succeeded',
  progress: { step: 'finished', message: 'The update check failed.' },
  result: baselineExample,
  error: null,
} satisfies Job<'check'>;
export const repairJobExample = {
  ...jobBase,
  operation: 'repair',
  status: 'succeeded',
  progress: {
    step: 'finished',
    message: 'The fix passed the required checks.',
  },
  repairAttempts: repairCheckedExample.attempts,
  result: repairCheckedExample,
  error: null,
} satisfies Job<'repair'>;
export const unsuccessfulRepairJobExample = {
  ...repairJobExample,
  progress: { step: 'finished', message: 'No verified fix is ready.' },
  repairAttempts: repairUnsuccessfulExample.attempts,
  result: repairUnsuccessfulExample,
} satisfies Job<'repair'>;
export const exportedJobExample = {
  ...jobBase,
  operation: 'export',
  versionId: candidate.id,
  status: 'succeeded',
  progress: { step: 'finished', message: 'Saved your checked project.' },
  result: exportSavedExample,
  error: null,
} satisfies Job<'export'>;
export const interruptedJobExample = {
  ...jobBase,
  operation: 'check',
  status: 'failed',
  progress: {
    step: 'finished',
    message: 'Checking stopped when the runner restarted.',
  },
  result: null,
  error: {
    code: 'interrupted',
    message: 'The runner restarted during checking.',
    nextStep: 'Run the checks again.',
  },
} satisfies Job<'check'>;
export const cancelledJobExample = {
  ...jobBase,
  operation: 'check',
  status: 'cancelled',
  progress: { step: 'finished', message: 'Checking cancelled.' },
  result: null,
  error: null,
} satisfies Job<'check'>;
export const staleVersionErrorExample = {
  error: {
    code: 'version_mismatch',
    message: 'This code version no longer matches the checked fix.',
    nextStep: 'Run checks on the current version before approving.',
  },
} satisfies ErrorResponse;

export const messageRequestExample = {
  text: 'Editing a task does not save its new name.',
} satisfies SendMessageRequest;
export const confirmGoalRequestExample = {
  expectedRevisionId: proposedGoalExample.revisionId,
  goal: draft,
} satisfies ConfirmGoalRequest;
export const checksRequestExample = {
  versionId: original.id,
  goalRevisionId: confirmedGoalExample.revisionId,
} satisfies RunChecksRequest;
export const repairRequestExample = {
  sourceVersionId: original.id,
  goalRevisionId: confirmedGoalExample.revisionId,
  baselineVerificationId: baselineExample.id,
} satisfies RepairRequest;
export const approveRequestExample = {
  versionId: candidate.id,
  goalRevisionId: confirmedGoalExample.revisionId,
  verificationId: checkedVerificationExample.id,
} satisfies ApproveFixRequest;
export const exportRequestExample = {
  approvalId: approvalExample.id,
  format: 'zip',
} satisfies ExportProjectRequest;
export const recheckRequestExample = {
  approvalId: approvalExample.id,
  versionId: original.id,
} satisfies RecheckRequest;

export const demoScenarios = {
  setupIncomplete: setupIncompleteExample,
  projectReady: projectReadyExample,
  baselineFailed: baselineFailedProjectExample,
  repairChecked: checkedProjectExample,
  repairUnsuccessful: unsuccessfulRepairJobExample,
  exportSaved: exportedJobExample,
};
