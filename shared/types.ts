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
  chromeProfiles?: ChromeProfile[];
  activeChromeProfile?: string;
  sessions?: ManagedSession[];
}

export interface ChromeProfile {
  name: string;
  userDataDir: string;
  profileDir: string;
  isActive?: boolean;
}

export interface ManagedSession {
  id: string;
  name: string;
  chromeProfile?: string;
  promptProfile?: string;
  cdpPort?: number;
  promptsFile?: string;
  imagePromptsFile?: string;
  titlesFile?: string;
  submittedLog?: string;
  failedLog?: string;
  downloadDir?: string;
  cleanDir?: string;
  cursorFile?: string;
  maxVideos?: number;
  openDrafts?: boolean;
  autoLaunchChrome?: boolean;
  autoLaunchAutogen?: boolean;
  notes?: string;
  status?: 'idle' | 'running' | 'warning' | 'error';
}

export type SessionCommandAction =
  | 'startChrome'
  | 'runPrompts'
  | 'runDownloads'
  | 'cleanWatermark'
  | 'stop';

export interface SessionLogEntry {
  timestamp: number;
  scope: 'Chrome' | 'Prompts' | 'Download' | 'Worker' | 'Watermark' | string;
  level: 'info' | 'error';
  message: string;
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
  draftsFound?: number;
  lastDownloadedFile?: string;
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

export type PipelineStepType =
  | 'session_prompts'
  | 'session_images'
  | 'session_mix'
  | 'session_download'
  | 'session_watermark'
  | 'session_chrome'
  | 'global_blur'
  | 'global_merge'
  | 'global_watermark'
  | 'global_probe'
  | 'pipeline';

export interface PipelineStep {
  type: PipelineStepType;
  sessions?: string[];
  limit?: number;
  group?: string;
}

export interface PipelineProgress {
  stepIndex: number;
  stepType: PipelineStepType;
  status: 'running' | 'success' | 'error';
  message: string;
  session?: string;
  timestamp?: number;
}
