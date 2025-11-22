import { randomUUID } from 'crypto';
import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';

import { getConfig } from '../config/config';
import { Session } from './types';

const SESSIONS_FILE = 'sessions.json';

async function ensureUserDataReady(): Promise<void> {
  if (app.isReady()) return;
  await app.whenReady();
}

async function getSessionsFilePath(): Promise<string> {
  await ensureUserDataReady();
  return path.join(app.getPath('userData'), SESSIONS_FILE);
}

async function readSessionsFile(): Promise<Session[]> {
  const filePath = await getSessionsFilePath();

  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as Session[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeSessionsFile(sessions: Session[]): Promise<void> {
  const filePath = await getSessionsFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(sessions, null, 2), 'utf-8');
}

export async function listSessions(): Promise<Session[]> {
  return readSessionsFile();
}

export async function getSession(id: string): Promise<Session | null> {
  const sessions = await readSessionsFile();
  return sessions.find((s) => s.id === id) ?? null;
}

export async function saveSession(session: Session): Promise<Session> {
  const sessions = await readSessionsFile();
  const next: Session = {
    ...session,
    id: session.id || randomUUID(),
  };

  const existingIndex = sessions.findIndex((s) => s.id === next.id);
  if (existingIndex >= 0) {
    sessions[existingIndex] = next;
  } else {
    sessions.push(next);
  }

  await writeSessionsFile(sessions);
  return next;
}

export async function deleteSession(id: string): Promise<void> {
  const sessions = await readSessionsFile();
  const filtered = sessions.filter((s) => s.id !== id);
  await writeSessionsFile(filtered);
}

export async function ensureSessionsRoot(): Promise<string> {
  const config = await getConfig();
  await fs.mkdir(config.sessionsRoot, { recursive: true });
  return config.sessionsRoot;
}

function resolvePath(root: string, target: string): string {
  if (path.isAbsolute(target)) return target;
  return path.join(root, target);
}

export async function getSessionPaths(session: Session): Promise<Record<string, string>> {
  const root = await ensureSessionsRoot();

  return {
    promptsFile: resolvePath(root, session.promptsFile),
    imagePromptsFile: resolvePath(root, session.imagePromptsFile),
    titlesFile: resolvePath(root, session.titlesFile),
    submittedLog: resolvePath(root, session.submittedLog),
    failedLog: resolvePath(root, session.failedLog),
    downloadDir: resolvePath(root, session.downloadDir),
    cleanDir: resolvePath(root, session.cleanDir),
    cursorFile: resolvePath(root, session.cursorFile),
  };
}
