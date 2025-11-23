import path from 'path';

import { STANDARD_WORKFLOW_ORDER, runWorkflow, type WorkflowStep } from '../../core/workflow/workflow';
import {
  DEFAULT_WORKFLOW_STEPS,
  type ManagedSession,
  type WorkflowClientStep,
  type WorkflowProgress,
  type WorkflowStepId,
} from '../../shared/types';
import { getSessionPaths, listSessions } from '../sessions/repo';
import type { Session } from '../sessions/types';
import { ensureBrowserForSession } from './sessionChrome';
import { runDownloads } from './downloader';
import { blurVideosInDir } from '../video/ffmpegBlur';
import { mergeVideosInDir } from '../video/ffmpegMerge';
import { stripMetadataInDir } from '../video/ffmpegMetadata';
import { logInfo } from '../logging/logger';
import { logError as logFileError } from '../../core/utils/log';

let cancelled = false;

function emitProgress(onProgress: (status: WorkflowProgress) => void, progress: WorkflowProgress): void {
  try {
    onProgress({ ...progress, timestamp: Date.now() });
  } catch (error) {
    logFileError('Workflow progress emit failed', error);
  }
}

function toSession(managed: ManagedSession): Session {
  const { status: _status, promptCount: _promptCount, titleCount: _titleCount, hasFiles: _hasFiles, ...rest } = managed;
  return rest;
}

async function pickSession(index: number): Promise<Session> {
  const sessions = await listSessions();
  if (!sessions[index]) {
    throw new Error(`Session ${index + 1} is not configured`);
  }
  return toSession(sessions[index]);
}

async function runDownloadForIndex(index: number): Promise<void> {
  const session = await pickSession(index);
  const limit = Number.isFinite(session.maxVideos) && session.maxVideos > 0 ? session.maxVideos : 0;
  const result = await runDownloads(session, limit ?? 0);
  if (!result.ok) {
    throw new Error(result.error ?? 'Download failed');
  }
}

async function runBlurVideos(): Promise<void> {
  const sessions = await listSessions();
  for (const managed of sessions) {
    const session = toSession(managed);
    const paths = await getSessionPaths(session);
    const sourceDir = paths.cleanDir || paths.downloadDir;
    const targetDir = path.join(paths.cleanDir, 'blurred');
    await blurVideosInDir(sourceDir, targetDir, 'default');
  }
}

async function runMergeVideos(): Promise<void> {
  const sessions = await listSessions();
  for (const managed of sessions) {
    const session = toSession(managed);
    const paths = await getSessionPaths(session);
    const sourceDir = path.join(paths.cleanDir, 'blurred');
    const outputFile = path.join(paths.cleanDir, 'merged.mp4');
    await mergeVideosInDir(sourceDir, outputFile);
  }
}

async function runCleanMetadata(): Promise<void> {
  const sessions = await listSessions();
  for (const managed of sessions) {
    const session = toSession(managed);
    const paths = await getSessionPaths(session);
    await stripMetadataInDir(paths.cleanDir);
  }
}

async function runOpenSessions(): Promise<void> {
  const sessions = await listSessions();
  for (const managed of sessions) {
    const session = toSession(managed);
    await ensureBrowserForSession(session);
  }
}

async function runStandardStep(stepId: WorkflowStepId): Promise<void> {
  switch (stepId) {
    case 'openSessions':
      await runOpenSessions();
      return;
    case 'downloadSession1':
      await runDownloadForIndex(0);
      return;
    case 'downloadSession2':
      await runDownloadForIndex(1);
      return;
    case 'blurVideos':
      await runBlurVideos();
      return;
    case 'mergeVideos':
      await runMergeVideos();
      return;
    case 'cleanMetadata':
      await runCleanMetadata();
      return;
    default:
      throw new Error(`Unknown workflow step: ${stepId}`);
  }
}

function normalizeClientSteps(steps: unknown): WorkflowClientStep[] {
  if (!Array.isArray(steps)) return DEFAULT_WORKFLOW_STEPS;
  const defaults = new Map<WorkflowStepId, WorkflowClientStep>(DEFAULT_WORKFLOW_STEPS.map((s) => [s.id, s]));
  const allowed = new Set<WorkflowStepId>(defaults.keys());

  const normalized: WorkflowClientStep[] = steps
    .map((step) => {
      const base = defaults.get(step?.id as WorkflowStepId);
      return {
        id: step?.id as WorkflowStepId,
        label:
          typeof step?.label === 'string' && step.label.length > 0
            ? step.label
            : base?.label || (typeof step?.id === 'string' ? (step.id as string) : ''),
        enabled: step?.enabled !== false,
        dependsOn: Array.isArray(step?.dependsOn)
          ? (step.dependsOn as WorkflowStepId[])
          : base?.dependsOn,
      };
    })
    .filter((step) => allowed.has(step.id));

  return normalized.length > 0 ? normalized : DEFAULT_WORKFLOW_STEPS;
}

function buildWorkflowSteps(selection: WorkflowClientStep[]): WorkflowStep[] {
  const defaults = new Map<WorkflowStepId, WorkflowClientStep>(DEFAULT_WORKFLOW_STEPS.map((s) => [s.id, s]));

  return STANDARD_WORKFLOW_ORDER.map((id) => {
    const stepId = id as WorkflowStepId;
    const preferred = selection.find((s) => s.id === stepId) ?? defaults.get(stepId);
    if (!preferred) return null;

    const fallback = defaults.get(stepId);
    return {
      id: stepId,
      label: preferred.label || fallback?.label || stepId,
      enabled: preferred.enabled ?? true,
      dependsOn: preferred.dependsOn ?? fallback?.dependsOn,
      run: () => runStandardStep(stepId),
    } satisfies WorkflowStep;
  }).filter(Boolean) as WorkflowStep[];
}

export async function runPipeline(
  steps: WorkflowClientStep[],
  onProgress: (status: WorkflowProgress) => void
): Promise<void> {
  cancelled = false;
  const normalized = normalizeClientSteps(steps);

  emitProgress(onProgress, { stepId: 'workflow', label: 'Workflow', status: 'running', message: 'Workflow starting', timestamp: Date.now() });

  const workflowSteps = buildWorkflowSteps(normalized);
  const results = await runWorkflow(workflowSteps, {
    onProgress: (event) => emitProgress(onProgress, { ...event, stepId: event.stepId as WorkflowStepId }),
    logger: (msg) => logInfo('Pipeline', msg),
    shouldCancel: () => cancelled,
  });

  const hadError = results.some((result) => result.status === 'error');
  const finalStatus = cancelled || hadError ? 'error' : 'success';
  emitProgress(onProgress, {
    stepId: 'workflow',
    label: 'Workflow',
    status: finalStatus,
    message: cancelled ? 'Workflow cancelled' : hadError ? 'Workflow finished with errors' : 'Workflow complete',
    timestamp: Date.now(),
  });
}

export function cancelPipeline(): void {
  cancelled = true;
}
