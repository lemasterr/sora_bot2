import { Session } from './types';

export async function listSessions(): Promise<Session[]> {
  // TODO: return stored sessions
  throw new Error('Not implemented');
}

export async function getSession(_id: string): Promise<Session | null> {
  // TODO: fetch a single session
  throw new Error('Not implemented');
}

export async function saveSession(_session: Session): Promise<Session> {
  // TODO: persist session
  throw new Error('Not implemented');
}

export async function deleteSession(_id: string): Promise<void> {
  // TODO: delete session
  throw new Error('Not implemented');
}

export async function ensureSessionsRoot(): Promise<string> {
  // TODO: ensure sessions directory exists
  throw new Error('Not implemented');
}

export function getSessionPaths(_session: Session): Record<string, string> {
  // TODO: resolve session paths
  return {};
}
