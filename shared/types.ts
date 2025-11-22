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
  autoSendDownloads?: boolean;
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

export interface RunResult {
  ok: boolean;
  details?: string;
  error?: string;
  submittedCount?: number;
  failedCount?: number;
  downloadedCount?: number;
  skippedCount?: number;
}

export interface DownloadedVideo {
  path: string;
  fileName: string;
  sessionName?: string;
  mtime: number;
}

export interface WatermarkFramesResult {
  frames: string[];
  tempDir: string;
}
