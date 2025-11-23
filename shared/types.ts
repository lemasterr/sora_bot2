import type { Config as BackendConfig } from '../electron/config/config';

export interface ChromeProfile {
  name: string;
  userDataDir: string;
  profileDirectory: string; // canonical profile directory name inside userDataDir
  profileDir?: string; // backward-compat alias for profileDirectory
  isActive?: boolean;
}

export interface ManagedSession {
  id: string;
  name: string;
  chromeProfileName: string | null;
  promptProfile: string | null;
  cdpPort: number | null;
  promptsFile: string;
  imagePromptsFile: string;
  titlesFile: string;
  submittedLog: string;
  failedLog: string;
  downloadDir: string;
  cleanDir: string;
  cursorFile: string;
  maxVideos: number;
  openDrafts: boolean;
  autoLaunchChrome: boolean;
  autoLaunchAutogen: boolean;
  notes: string;
  status?: 'idle' | 'running' | 'warning' | 'error';
  promptCount?: number;
  titleCount?: number;
  hasFiles?: boolean;
  downloadedCount?: number;
}

// The Config type mirrors the canonical backend shape from electron/config/config.ts.
// Optional arrays such as chromeProfiles or sessions are convenience fields derived at runtime
// and may not be persisted by the config module itself.
export type Config = BackendConfig & {
  chromeProfiles?: ChromeProfile[];
  sessions?: ManagedSession[];
  watermarkMasks?: WatermarkMask[];
  activeWatermarkMaskId?: string;
};

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

export type LogSource = 'Chrome' | 'Autogen' | 'Downloader' | 'Pipeline' | string;

export interface AppLogEntry {
  timestamp: number;
  source: LogSource;
  level: 'info' | 'error';
  message: string;
  sessionId?: string;
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

export interface WatermarkRect {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

export interface WatermarkMask {
  id: string;
  name: string;
  rects: WatermarkRect[];
  updatedAt?: number;
}

export interface WatermarkDetectionFrame {
  path: string;
  width: number;
  height: number;
  rects: WatermarkRect[];
}

export interface WatermarkDetectionResult {
  frames: WatermarkDetectionFrame[];
  suggestedMask?: WatermarkMask;
}

export interface WatermarkCleanItemResult {
  video: string;
  output?: string;
  status: 'cleaned' | 'skipped' | 'error';
  message?: string;
}

export interface WatermarkCleanResult {
  ok: boolean;
  items: WatermarkCleanItemResult[];
  error?: string;
}

export interface ElectronAPI {
  listDownloadedVideos: () => Promise<DownloadedVideo[]>;
  config?: { get: () => Promise<Config>; update: (partial: Partial<Config>) => Promise<Config> };
  chrome?: {
    scanProfiles: () => Promise<ChromeProfile[]>;
    listProfiles: () => Promise<ChromeProfile[]>;
    setActiveProfile: (name: string) => Promise<unknown>;
    cloneProfile: () => Promise<unknown>;
  };
  sessions?: {
    list: () => Promise<ManagedSession[]>;
    get?: (id: string) => Promise<ManagedSession | null>;
    save: (session: ManagedSession) => Promise<ManagedSession>;
    delete?: (id: string) => Promise<unknown>;
    command: (sessionId: string, action: SessionCommandAction) => Promise<unknown>;
    runPrompts?: (id: string) => Promise<unknown>;
    cancelPrompts?: (id: string) => Promise<unknown>;
    runDownloads?: (id: string, maxVideos?: number) => Promise<unknown>;
    cancelDownloads?: (id: string) => Promise<unknown>;
    subscribeLogs: (sessionId: string, cb: (entry: SessionLogEntry) => void) => () => void;
  };
  files?: {
    read: (profileName?: string | null) => Promise<unknown>;
    save: (profileName: string | null, files: SessionFiles) => Promise<unknown>;
  };
  sessionFiles?: {
    read: (profileName?: string | null) => Promise<unknown>;
    save: (profileName: string | null, files: SessionFiles) => Promise<unknown>;
  };
  autogen?: {
    run: (sessionId: string) => Promise<unknown>;
    stop: (sessionId: string) => Promise<unknown>;
  };
  downloader?: {
    run?: (sessionId: string, options?: unknown) => Promise<unknown>;
    stop?: (sessionId: string) => Promise<unknown>;
    openDrafts: (sessionKey: string) => Promise<unknown>;
    scanDrafts: (sessionKey: string) => Promise<unknown>;
    downloadAll: (sessionKey: string, options?: { limit?: number }) => Promise<unknown>;
  };
  pipeline?: {
    run: (steps: unknown) => Promise<unknown>;
    cancel: () => Promise<unknown>;
    onProgress: (cb: (status: unknown) => void) => () => void;
  };
  window?: {
    minimize: () => Promise<unknown>;
    maximize: () => Promise<unknown>;
    isWindowMaximized?: () => Promise<unknown>;
    close: () => Promise<unknown>;
  };
  logs?: {
    subscribe: (cb: (entry: AppLogEntry) => void) => () => void;
    export: () => Promise<unknown>;
  };
  qa?: { batchRun: (videoDir?: string) => Promise<unknown> };
  video?: {
    extractPreviewFrames: (videoPath: string, count: number) => Promise<unknown>;
    pickSmartPreviewFrames: (videoPath: string, count: number) => Promise<unknown>;
    blurWithProfile: (input: string, output: string, profileId: string) => Promise<unknown>;
    blurProfiles: {
      list: () => Promise<unknown>;
      save: (profile: unknown) => Promise<unknown>;
      delete: (id: string) => Promise<unknown>;
    };
  };
  cleanup?: { run: () => Promise<unknown> };
  telegram?: { test: () => Promise<unknown>; sendMessage: (text: string) => Promise<unknown> };
  analytics?: { getDailyStats: (days: number) => Promise<unknown>; getTopSessions: (limit: number) => Promise<unknown> };
  selectorInspector?: { start: (sessionId: string) => Promise<unknown>; getLast: (sessionId: string) => Promise<unknown> };
  watermark?: {
    listMasks: () => Promise<WatermarkMask[]>;
    detect: (videoPath: string, templatePath?: string) => Promise<WatermarkDetectionResult>;
    saveMask: (mask: WatermarkMask) => Promise<WatermarkMask[]>;
    clean: (videoPaths: string[], maskId?: string) => Promise<WatermarkCleanResult>;
  };
  logging?: {
    rendererError: (payload: unknown) => Promise<unknown>;
    onLog: (cb: (entry: AppLogEntry) => void) => void;
  };
  system?: { openPath: (target: string) => Promise<unknown>; openLogs: () => Promise<unknown> };
  ping?: () => Promise<unknown>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
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
  id?: string; // optional client-side identifier
  type: PipelineStepType;
  sessionIds?: string[];
  limit?: number;
  group?: string;
}

export interface PipelineProgress {
  stepIndex: number; // -1 reserved for pipeline-level events
  stepType: PipelineStepType;
  status: 'running' | 'success' | 'error';
  message: string;
  session?: string;
  timestamp: number;
}
