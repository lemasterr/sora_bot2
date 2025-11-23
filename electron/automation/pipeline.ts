import path from 'path';

import type { PipelineProgress, PipelineStep, PipelineStepType } from '../../shared/types';
import type { Session } from '../sessions/types';
import { getSession, getSessionPaths } from '../sessions/repo';
import { runPrompts } from './promptsRunner';
import { runDownloads } from './downloader';
import { cleanWatermarkBatch } from '../video/ffmpegWatermark';
import { blurVideosInDir } from '../video/ffmpegBlur';
import { stripMetadataInDir } from '../video/ffmpegMetadata';
import { mergeVideosInDir } from '../video/ffmpegMerge';
import { getConfig } from '../config/config';
import { formatTemplate, sendTelegramMessage } from '../integrations/telegram';

let cancelled = false;
const DEFAULT_TEMPLATE_DATA = { submitted: 0, failed: 0, downloaded: 0 };
const WATCHDOG_ERROR = 'watchdog_timeout';

function emit(
  onProgress: (status: PipelineProgress) => void,
  progress: Omit<PipelineProgress, 'timestamp'>
) {
  try {
    onProgress({ ...progress, timestamp: Date.now() });
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
  onProgress: (status: PipelineProgress) => void
): Promise<void> {
  cancelled = false;
  const start = Date.now();
  let submitted = 0;
  let failed = 0;
  let downloaded = 0;
  let hadError = false;

  emit(onProgress, { stepIndex: -1, stepType: 'pipeline', status: 'running', message: 'Pipeline starting' });

  try {
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      if (cancelled) break;

      const stepType = (step.type ?? 'pipeline') as PipelineStepType;
      let stepErrored = false;

      emit(onProgress, { stepIndex: index, stepType, status: 'running', message: `Running ${stepType}` });

      switch (stepType) {
        case 'session_prompts': {
          const sessions = await resolveSessions(step.sessionIds);
          for (const session of sessions) {
            if (cancelled) break;
            emit(onProgress, {
              stepIndex: index,
              stepType,
              status: 'running',
              message: `Running prompts for ${session.name}`,
              session: session.id,
            });
            try {
              const result = await runPrompts(session);
              submitted += result.submitted;
              failed += result.failed;
              if (!result.ok) {
                hadError = true;
                stepErrored = true;
                emit(onProgress, {
                  stepIndex: index,
                  stepType,
                  status: 'error',
                  message: result.error ?? 'Prompts failed',
                  session: session.id,
                });
              } else if (result.errorCode === WATCHDOG_ERROR) {
                hadError = true;
                stepErrored = true;
                emit(onProgress, {
                  stepIndex: index,
                  stepType,
                  status: 'error',
                  message: 'Watchdog timeout during prompts',
                  session: session.id,
                });
              } else {
                emit(onProgress, {
                  stepIndex: index,
                  stepType,
                  status: 'success',
                  message: `Finished prompts for ${session.name}`,
                  session: session.id,
                });
              }
            } catch (error) {
              hadError = true;
              stepErrored = true;
              emit(onProgress, {
                stepIndex: index,
                stepType,
                status: 'error',
                message: (error as Error).message ?? 'Prompts failed',
                session: session.id,
              });
            }
          }
          break;
        }
        case 'session_download': {
          const sessions = await resolveSessions(step.sessionIds);
          const maxVideos = typeof step.limit === 'number' && step.limit > 0 ? step.limit : 0;
          for (const session of sessions) {
            if (cancelled) break;
            emit(onProgress, {
              stepIndex: index,
              stepType,
              status: 'running',
              message: `Running download for ${session.name}`,
              session: session.id,
            });
            const result = await runDownloads(session, maxVideos);
            downloaded += result.downloaded;
            if (!result.ok) {
              hadError = true;
              stepErrored = true;
              emit(onProgress, {
                stepIndex: index,
                stepType,
                status: 'error',
                message: result.error ?? 'Download failed',
                session: session.id,
              });
            } else if (result.errorCode === WATCHDOG_ERROR) {
              hadError = true;
              stepErrored = true;
              emit(onProgress, {
                stepIndex: index,
                stepType,
                status: 'error',
                message: 'Watchdog timeout during download',
                session: session.id,
              });
            } else {
              emit(onProgress, {
                stepIndex: index,
                stepType,
                status: 'success',
                message: `Finished download for ${session.name}`,
                session: session.id,
              });
            }
          }
          break;
        }
        case 'session_watermark': {
          const sessions = await resolveSessions(step.sessionIds);
          for (const session of sessions) {
            if (cancelled) break;
            try {
              const paths = await getSessionPaths(session);
              await cleanWatermarkBatch(paths.downloadDir, paths.cleanDir);
              await stripMetadataInDir(paths.cleanDir);
              emit(onProgress, {
                stepIndex: index,
                stepType,
                status: 'success',
                message: `Copied videos to clean folder for ${session.name}`,
                session: session.id,
              });
            } catch (error) {
              hadError = true;
              stepErrored = true;
              emit(onProgress, {
                stepIndex: index,
                stepType,
                status: 'error',
                message: (error as Error).message ?? 'Watermark clean failed',
                session: session.id,
              });
            }
          }
          break;
        }
        case 'session_images':
        case 'session_mix':
        case 'session_chrome': {
          const sessions = await resolveSessions(step.sessionIds);
          for (const session of sessions) {
            if (cancelled) break;
            emit(onProgress, {
              stepIndex: index,
              stepType,
              status: 'success',
              message: `${stepType} not implemented for ${session.name}`,
              session: session.id,
            });
          }
          break;
        }
        case 'global_blur': {
          const sessions = await resolveSessions(step.sessionIds);
          const profileId = step.group || 'default';
          for (const session of sessions) {
            if (cancelled) break;
            try {
              const paths = await getSessionPaths(session);
              const sourceDir = paths.cleanDir || paths.downloadDir;
              const targetDir = path.join(paths.cleanDir, 'blurred');
              await blurVideosInDir(sourceDir, targetDir, profileId);
              emit(onProgress, {
                stepIndex: index,
                stepType,
                status: 'success',
                message: `Blurred videos for ${session.name} using profile ${profileId}`,
                session: session.id,
              });
            } catch (error) {
              hadError = true;
              stepErrored = true;
              emit(onProgress, {
                stepIndex: index,
                stepType,
                status: 'error',
                message: (error as Error).message ?? 'Blur failed',
                session: session.id,
              });
            }
          }
          break;
        }
        case 'global_merge': {
          const sessions = await resolveSessions(step.sessionIds);
          for (const session of sessions) {
            if (cancelled) break;
            try {
              const paths = await getSessionPaths(session);
              const sourceDir = path.join(paths.cleanDir, 'blurred');
              const outputFile = path.join(paths.cleanDir, 'merged.mp4');
              await mergeVideosInDir(sourceDir, outputFile);
              emit(onProgress, {
                stepIndex: index,
                stepType,
                status: 'success',
                message: `Merged videos for ${session.name}`,
                session: session.id,
              });
            } catch (error) {
              hadError = true;
              stepErrored = true;
              emit(onProgress, {
                stepIndex: index,
                stepType,
                status: 'error',
                message: (error as Error).message ?? 'Merge failed',
                session: session.id,
              });
            }
          }
          break;
        }
        case 'global_watermark':
        case 'global_probe': {
          emit(onProgress, {
            stepIndex: index,
            stepType,
            status: 'success',
            message: `${stepType} step completed (stub)`,
          });
          break;
        }
        default:
          break;
      }

      emit(onProgress, {
        stepIndex: index,
        stepType,
        status: cancelled || stepErrored ? 'error' : 'success',
        message: cancelled
          ? 'Step cancelled'
          : stepErrored
            ? `Finished ${stepType} with errors`
            : `Finished ${stepType}`,
      });
    }
  } catch (error) {
    emit(onProgress, {
      stepIndex: -1,
      stepType: 'pipeline',
      status: 'error',
      message: (error as Error).message ?? 'Pipeline failed',
    });
    hadError = true;
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
    emit(onProgress, {
      stepIndex: -1,
      stepType: 'pipeline',
      status: cancelled || hadError ? 'error' : 'success',
      message: cancelled ? 'Pipeline cancelled' : hadError ? 'Pipeline failed' : 'Pipeline complete',
    });
  }
}

export function cancelPipeline(): void {
  cancelled = true;
}
