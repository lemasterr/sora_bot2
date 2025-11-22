export interface Config {
  sessionsRoot: string;
  chromeExecutablePath: string;
  ffmpegPath: string;
  promptDelayMs: number;
  draftTimeoutMs: number;
  downloadTimeoutMs: number;
  maxParallelSessions: number;
  telegramBotToken?: string;
  telegramChatId?: string;
}

export interface SessionInfo {
  name: string;
  path: string;
  hasFiles: boolean;
  promptCount: number;
  titleCount: number;
}

export interface SessionFiles {
  prompts: string[];
  imagePrompts: string[];
  titles: string[];
}
