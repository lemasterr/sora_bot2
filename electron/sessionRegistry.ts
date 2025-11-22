import { randomUUID } from 'crypto';
import type { ManagedSession } from '../shared/types';
import { loadConfig, saveConfig } from './config';

const ensureId = (session: ManagedSession | Omit<ManagedSession, 'id'>): ManagedSession => {
  if ('id' in session && session.id) return session as ManagedSession;
  return { ...(session as Omit<ManagedSession, 'id'>), id: randomUUID() };
};

export const listManagedSessions = async (): Promise<ManagedSession[]> => {
  const config = await loadConfig();
  return config.sessions ?? [];
};

export const saveManagedSession = async (
  session: ManagedSession | Omit<ManagedSession, 'id'>
): Promise<ManagedSession[]> => {
  const config = await loadConfig();
  const existing = config.sessions ?? [];
  const record = ensureId(session);
  const idx = existing.findIndex((s) => s.id === record.id);
  const next = [...existing];
  if (idx >= 0) {
    next[idx] = { ...existing[idx], ...record };
  } else {
    next.push(record);
  }
  await saveConfig({ sessions: next });
  return next;
};

export const removeManagedSession = async (id: string): Promise<ManagedSession[]> => {
  const config = await loadConfig();
  const next = (config.sessions ?? []).filter((s) => s.id !== id);
  await saveConfig({ sessions: next });
  return next;
};
