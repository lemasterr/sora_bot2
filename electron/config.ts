import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import type { Config } from '../shared/types';

const defaultConfig = (): Config => ({
  sessionsRoot: path.join(app.getPath('userData'), 'sessions'),
  chromeExecutablePath: '',
  ffmpegPath: '',
  promptDelayMs: 2000,
  draftTimeoutMs: 60_000,
  downloadTimeoutMs: 300_000,
  maxParallelSessions: 2,
  autoSendDownloads: false,
  chromeProfiles: [],
  activeChromeProfile: undefined
});

const getConfigPath = () => path.join(app.getPath('userData'), 'config.json');

const ensureConfigDir = async () => {
  const dir = path.dirname(getConfigPath());
  await fs.mkdir(dir, { recursive: true });
};

export const loadConfig = async (): Promise<Config> => {
  await ensureConfigDir();
  const fallback = defaultConfig();

  try {
    const raw = await fs.readFile(getConfigPath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<Config>;
    const merged: Config = {
      ...fallback,
      ...parsed,
      sessionsRoot: parsed.sessionsRoot ?? fallback.sessionsRoot
    };

    await fs.mkdir(merged.sessionsRoot, { recursive: true });
    return merged;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      await fs.writeFile(getConfigPath(), JSON.stringify(fallback, null, 2), 'utf-8');
      await fs.mkdir(fallback.sessionsRoot, { recursive: true });
      return fallback;
    }

    throw error;
  }
};

export const saveConfig = async (partial: Partial<Config>): Promise<void> => {
  await ensureConfigDir();
  const current = await loadConfig();
  const next: Config = {
    ...current,
    ...partial,
    sessionsRoot: partial.sessionsRoot ?? current.sessionsRoot
  };

  await fs.mkdir(next.sessionsRoot, { recursive: true });
  await fs.writeFile(getConfigPath(), JSON.stringify(next, null, 2), 'utf-8');
};
