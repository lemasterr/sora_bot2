import { app } from 'electron';

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
};

export function getUserDataPath(): string {
  return app.getPath('userData');
}

export async function getConfig(): Promise<Config> {
  // TODO: implement loading defaults
  throw new Error('Not implemented');
}

export async function updateConfig(_partial: Partial<Config>): Promise<Config> {
  // TODO: implement update and persistence
  throw new Error('Not implemented');
}
