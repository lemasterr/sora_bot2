import type { Session } from '../sessions/types';

export type PromptsRunResult = {
  ok: boolean;
  submitted: number;
  failed: number;
  error?: string;
};

export async function runPrompts(_session: Session): Promise<PromptsRunResult> {
  // TODO: implement prompt submission automation
  throw new Error('Not implemented');
}

export function cancelPrompts(_sessionId: string): void {
  // TODO: cancel an in-flight prompts run
}
