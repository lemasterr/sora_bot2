export interface ChromeProfileConfig {
  name: string;
  userDataDir: string;
  profileDir: string;
}

export interface FfmpegConfig {
  binaryPath: string;
  defaultVcodec?: string;
  crf?: number;
  preset?: string;
}

export interface WatermarkCleanerConfig {
  templatePath?: string;
  confidenceThreshold?: number;
  framesCount?: number;
  downscaleFactor?: number;
}

export interface AutomatorConfig {
  promptDelayMs?: number;
  draftTimeoutMs?: number;
  downloadTimeoutMs?: number;
  retryCount?: number;
}

export interface TelegramConfig {
  botToken?: string;
  chatId?: string;
  autoSendDownloads?: boolean;
}

export interface SessionsConfig {
  rootDirectory: string;
  autoCleanup?: boolean;
}

export interface Config {
  chromeExecutablePath?: string;
  chromeUserDataDir?: string;
  activeProfile?: string;
  profiles?: ChromeProfileConfig[];
  sessions: SessionsConfig;
  ffmpeg?: FfmpegConfig;
  watermark?: WatermarkCleanerConfig;
  automator?: AutomatorConfig;
  telegram?: TelegramConfig;
}

export const loadConfig = async (): Promise<Config> => {
  throw new Error("Not implemented");
};

export const saveConfig = async (_config: Partial<Config>): Promise<void> => {
  throw new Error("Not implemented");
};
