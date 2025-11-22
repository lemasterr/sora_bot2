import { getSession } from "../sessions/repo";
import { Session } from "../sessions/types";
import { runDownloads } from "./downloader";
import { runPrompts } from "./promptsRunner";

export type StepType =
  | "session_prompts"
  | "session_images"
  | "session_mix"
  | "session_download"
  | "session_watermark"
  | "session_chrome"
  | "global_blur"
  | "global_merge"
  | "global_watermark"
  | "global_probe";

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

const resolveSessions = async (sessionIds?: string[]): Promise<Session[]> => {
  if (!sessionIds?.length) return [];

  const sessions: Session[] = [];
  for (const id of sessionIds) {
    const session = await getSession(id);
    if (session) {
      sessions.push(session);
    }
  }
  return sessions;
};

const reportStatus = (onProgress: (status: PipelineStatus) => void, status: PipelineStatus): void => {
  try {
    onProgress(status);
  } catch {
    // ignore listener errors
  }
};

export const cancelPipeline = (): void => {
  cancelled = true;
};

export const runPipeline = async (
  steps: PipelineStep[],
  onProgress: (status: PipelineStatus) => void,
): Promise<void> => {
  cancelled = false;
  reportStatus(onProgress, { running: true, currentStepId: null, message: "Starting pipeline" });

  for (const step of steps) {
    if (cancelled) break;

    reportStatus(onProgress, {
      running: true,
      currentStepId: step.id,
      message: `Running step ${step.type}`,
    });

    try {
      switch (step.type) {
        case "session_prompts": {
          const sessions = await resolveSessions(step.sessionIds);
          for (const session of sessions) {
            if (cancelled) break;
            await runPrompts(session);
          }
          break;
        }
        case "session_download": {
          const sessions = await resolveSessions(step.sessionIds);
          for (const session of sessions) {
            if (cancelled) break;
            await runDownloads(session, step.limit ?? Number.POSITIVE_INFINITY);
          }
          break;
        }
        case "session_watermark":
        case "session_images":
        case "session_mix":
        case "session_chrome":
        case "global_blur":
        case "global_merge":
        case "global_watermark":
        case "global_probe":
          // Placeholder for future implementations
          break;
        default:
          break;
      }

      reportStatus(onProgress, {
        running: !cancelled,
        currentStepId: cancelled ? null : step.id,
        message: cancelled ? "Pipeline cancelled" : `Completed step ${step.type}`,
      });
    } catch (error: any) {
      reportStatus(onProgress, {
        running: false,
        currentStepId: step.id,
        message: `Error in step ${step.type}: ${error?.message ?? String(error)}`,
      });
      return;
    }
  }

  reportStatus(onProgress, {
    running: false,
    currentStepId: null,
    message: cancelled ? "Pipeline cancelled" : "Pipeline completed",
  });
};
