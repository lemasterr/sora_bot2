import type { Session } from '../sessions/types';

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

export async function runPipeline(
  _steps: PipelineStep[],
  _onProgress: (status: PipelineStatus) => void
): Promise<void> {
  // TODO: implement sequential pipeline execution
  throw new Error('Not implemented');
}

export function cancelPipeline(): void {
  // TODO: implement pipeline cancellation
}
