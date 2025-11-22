import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';

export type Config = {
  sessionsRoot: string;
  chromeExecutablePath: string | null;
  chromeUserDataDir: string | null;
  chromeActiveProfileName: string | null;
  promptDelayMs: number;
  draftTimeoutMs: number;
  downloadTimeoutMs: number;
  maxParallelSessions: number;
  ffmpegPath: string | null;
  telegram: {
    enabled: boolean;
    botToken: string | null;
    chatId: string | null;
  };
  telegramTemplates?: {
    pipelineFinished?: string;
    sessionError?: string;
  };
  hooks?: {
    postDownload?: string;
  };
};

const CONFIG_FILE = 'config.json';
let cachedConfig: Config | null = null;

function defaultConfig(): Config {
  return {
    sessionsRoot: path.join(getUserDataPath(), 'sessions'),
    chromeExecutablePath: null,
    chromeUserDataDir: null,
    chromeActiveProfileName: null,
    promptDelayMs: 2000,
    draftTimeoutMs: 60_000,
    downloadTimeoutMs: 300_000,
    maxParallelSessions: 2,
    ffmpegPath: null,
    telegram: {
      enabled: false,
      botToken: null,
      chatId: null,
    },
    telegramTemplates: {
      pipelineFinished: undefined,
      sessionError: undefined,
    },
    hooks: {
      postDownload: undefined,
    },
  };
}

function getConfigPath(): string {
  return path.join(getUserDataPath(), CONFIG_FILE);
}

async function ensureAppReady(): Promise<void> {
  if (app.isReady()) return;
  await app.whenReady();
}

async function ensureConfigDir(): Promise<void> {
  await ensureAppReady();
  await fs.mkdir(getUserDataPath(), { recursive: true });
}

export function getUserDataPath(): string {
  return app.getPath('userData');
}

function mergeConfig(base: Config, partial?: Partial<Config>): Config {
  const next: Config = {
    ...base,
    ...partial,
    telegram: {
      ...base.telegram,
      ...(partial?.telegram ?? {}),
    },
    telegramTemplates: {
      ...base.telegramTemplates,
      ...(partial?.telegramTemplates ?? {}),
    },
    hooks: {
      ...base.hooks,
      ...(partial?.hooks ?? {}),
    },
  };
  return next;
}

export async function getConfig(): Promise<Config> {
  if (cachedConfig) return cachedConfig;

  await ensureConfigDir();
  const defaults = defaultConfig();

  try {
    const raw = await fs.readFile(getConfigPath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<Config>;
    const merged = mergeConfig(defaults, parsed);
    await fs.mkdir(merged.sessionsRoot, { recursive: true });
    cachedConfig = merged;
    return merged;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      throw error;
    }

    await fs.writeFile(getConfigPath(), JSON.stringify(defaults, null, 2), 'utf-8');
    await fs.mkdir(defaults.sessionsRoot, { recursive: true });
    cachedConfig = defaults;
    return defaults;
  }
}

export async function updateConfig(partial: Partial<Config>): Promise<Config> {
  const current = await getConfig();
  const next = mergeConfig(current, partial);
  await ensureConfigDir();
  await fs.mkdir(next.sessionsRoot, { recursive: true });
  await fs.writeFile(getConfigPath(), JSON.stringify(next, null, 2), 'utf-8');
  cachedConfig = next;
  return next;
}
