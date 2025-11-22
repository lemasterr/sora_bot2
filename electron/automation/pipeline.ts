import type { Session } from '../sessions/types';
import { getSession, getSessionPaths } from '../sessions/repo';
import { runPrompts } from './promptsRunner';
import { runDownloads } from './downloader';
import { cleanWatermarkBatch } from '../video/ffmpegWatermark';
import { getConfig } from '../config/config';
import { formatTemplate, sendTelegramMessage } from '../integrations/telegram';

export type StepType =
  | 'session_prompts'
  | 'session_images'
  | 'session_mix'
  | 'session_download'
  | 'session_watermark'
  | 'session_chrome'
  | 'global_blur'
  | 'global_merge'
  | 'global_watermark'
  | 'global_probe';

export type PipelineStep = {
  id: string;
  type: StepType;
  sessionIds?: string[];
  limit?: number;
  group?: string;
};

export type PipelineStatus = {
  running: boolean;
  currentStepId: string | null;
  message: string;
};

let cancelled = false;
const DEFAULT_TEMPLATE_DATA = { submitted: 0, failed: 0, downloaded: 0 };

function report(onProgress: (status: PipelineStatus) => void, status: PipelineStatus) {
  try {
    onProgress(status);
  } catch (error) {
    // swallow renderer progress errors
    // eslint-disable-next-line no-console
    console.warn('Pipeline progress error', error);
  }
}

async function resolveSessions(ids: string[] = []): Promise<Session[]> {
  const sessions: Session[] = [];
  for (const id of ids) {
    const session = await getSession(id);
    if (session) {
      sessions.push(session);
    }
  }
  return sessions;
}

export async function runPipeline(
  steps: PipelineStep[],
  onProgress: (status: PipelineStatus) => void
): Promise<void> {
  cancelled = false;
  const start = Date.now();
  let submitted = 0;
  let failed = 0;
  let downloaded = 0;
  report(onProgress, { running: true, currentStepId: null, message: 'Pipeline starting' });

  try {
    for (const step of steps) {
      if (cancelled) break;

      report(onProgress, {
        running: true,
        currentStepId: step.id,
        message: `Running ${step.type}`,
      });

      switch (step.type) {
        case 'session_prompts': {
          const sessions = await resolveSessions(step.sessionIds);
          for (const session of sessions) {
            if (cancelled) break;
            const result = await runPrompts(session);
            submitted += result.submitted;
            failed += result.failed;
          }
          break;
        }
        case 'session_download': {
          const sessions = await resolveSessions(step.sessionIds);
          for (const session of sessions) {
            if (cancelled) break;
            const result = await runDownloads(session, step.limit ?? 0);
            downloaded += result.downloaded;
          }
          break;
        }
        case 'session_watermark': {
          const sessions = await resolveSessions(step.sessionIds);
          for (const session of sessions) {
            if (cancelled) break;
            const paths = await getSessionPaths(session);
            await cleanWatermarkBatch(paths.downloadDir, paths.cleanDir);
          }
          break;
        }
        case 'session_images':
        case 'session_mix':
        case 'session_chrome':
        case 'global_blur':
        case 'global_merge':
        case 'global_watermark':
        case 'global_probe': {
          // Stubs for future implementation
          break;
        }
        default:
          break;
      }
    }
  } finally {
    const durationMinutes = Number(((Date.now() - start) / 1000 / 60).toFixed(2));
    if (!cancelled) {
      const config = await getConfig();
      const template = config.telegramTemplates?.pipelineFinished;
      if (config.telegram?.enabled && template) {
        const text = formatTemplate(template, {
          ...DEFAULT_TEMPLATE_DATA,
          submitted,
          failed,
          downloaded,
          durationMinutes,
          session: 'pipeline',
        });
        await sendTelegramMessage(text);
      }
    }
    report(onProgress, {
      running: false,
      currentStepId: null,
      message: cancelled ? 'Pipeline cancelled' : 'Pipeline complete',
    });
  }
}

export function cancelPipeline(): void {
  cancelled = true;
}
