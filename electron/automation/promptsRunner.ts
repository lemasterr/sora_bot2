import { SessionRecord } from "../sessions/types";

export interface PromptRunResult {
  ok: boolean;
  submittedCount?: number;
  failedCount?: number;
  error?: string;
}

export const runPrompts = async (_session: SessionRecord): Promise<PromptRunResult> => {
  throw new Error("Not implemented");
};

export const cancelPrompts = async (_sessionId: string): Promise<void> => {
  throw new Error("Not implemented");
};
