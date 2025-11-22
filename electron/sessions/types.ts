export interface SessionRecord {
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
}

export interface SessionStatus {
  sessionId: string;
  isRunning: boolean;
  lastUpdated?: number;
  state?: "idle" | "running" | "error" | "completed";
}
