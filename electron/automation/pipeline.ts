import { Session } from "../sessions/types";
import { DownloadStats } from "./downloader";
import { PromptRunResult } from "./promptsRunner";

export type PipelineStepType =
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

export interface PipelineStep {
  id: string;
  type: PipelineStepType;
  sessions?: string[];
  limit?: number;
  group?: string;
}

export interface PipelineProgress {
  stepId: string;
  status: "pending" | "running" | "completed" | "error" | "cancelled";
  message?: string;
}

export interface PipelineResult {
  prompts?: PromptRunResult[];
  downloads?: DownloadStats[];
}

export const runPipeline = async (
  _steps: PipelineStep[],
  _sessionLookup: (id: string) => Session | null,
): Promise<PipelineResult> => {
  throw new Error("Not implemented");
};

export const stopPipeline = async (): Promise<void> => {
  throw new Error("Not implemented");
};

export const onPipelineProgress = (_listener: (progress: PipelineProgress) => void): void => {
  void _listener;
};
