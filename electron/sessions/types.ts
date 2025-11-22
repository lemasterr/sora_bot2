export type Session = {
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
};

export type SessionPaths = {
  promptsFile: string;
  imagePromptsFile: string;
  titlesFile: string;
  submittedLog: string;
  failedLog: string;
  downloadDir: string;
  cleanDir: string;
  cursorFile: string;
};

export type SessionStatus = {
  sessionId: string;
  isRunning: boolean;
  lastUpdated?: number;
  state?: "idle" | "running" | "error" | "completed";
};

// Backwards compatibility for earlier imports.
export type SessionRecord = Session;
