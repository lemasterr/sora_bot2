import { app } from "electron";
import { promises as fs } from "fs";
import path from "path";

export interface TelegramConfig {
  enabled: boolean;
  botToken: string | null;
  chatId: string | null;
}

export interface Config {
  sessionsRoot: string;
  chromeExecutablePath: string | null;
  chromeUserDataDir: string | null;
  chromeActiveProfileName: string | null;
  promptDelayMs: number;
  draftTimeoutMs: number;
  downloadTimeoutMs: number;
  maxParallelSessions: number;
  ffmpegPath: string | null;
  telegram: TelegramConfig;
}

const DEFAULT_CONFIG = (): Config => ({
  sessionsRoot: path.join(app.getPath("userData"), "sessions"),
  chromeExecutablePath: null,
  chromeUserDataDir: null,
  chromeActiveProfileName: null,
  promptDelayMs: 1500,
  draftTimeoutMs: 30000,
  downloadTimeoutMs: 60000,
  maxParallelSessions: 1,
  ffmpegPath: null,
  telegram: {
    enabled: false,
    botToken: null,
    chatId: null,
  },
});

let cachedConfig: Config | null = null;

export const getUserDataPath = (): string =>
  path.join(app.getPath("userData"), "config.json");

const ensureConfigFile = async (filePath: string, config: Config): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(config, null, 2), "utf-8");
};

const mergeConfig = (base: Config, partial: Partial<Config>): Config => ({
  ...base,
  ...partial,
  telegram: {
    ...base.telegram,
    ...(partial.telegram ?? {}),
  },
});

export const getConfig = async (): Promise<Config> => {
  if (cachedConfig) return cachedConfig;

  const filePath = getUserDataPath();
  const defaults = DEFAULT_CONFIG();

  try {
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(content) as Partial<Config>;
    cachedConfig = mergeConfig(defaults, parsed);
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      cachedConfig = defaults;
      await ensureConfigFile(filePath, cachedConfig);
    } else {
      throw error;
    }
  }

  return cachedConfig;
};

export const updateConfig = async (partial: Partial<Config>): Promise<Config> => {
  const current = await getConfig();
  const updated = mergeConfig(current, partial);
  const filePath = getUserDataPath();
  await ensureConfigFile(filePath, updated);
  cachedConfig = updated;
  return updated;
};
