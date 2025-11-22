import { Session } from "../sessions/types";

export interface DownloadStats {
  ok: boolean;
  downloadedCount?: number;
  skippedCount?: number;
  lastDownloadedFile?: string;
  error?: string;
}

export const openDrafts = async (_session: Session): Promise<void> => {
  throw new Error("Not implemented");
};

export const scanDrafts = async (_session: Session): Promise<number> => {
  throw new Error("Not implemented");
};

export const runDownloads = async (_session: Session): Promise<DownloadStats> => {
  throw new Error("Not implemented");
};

export const cancelDownloads = async (_sessionId: string): Promise<void> => {
  throw new Error("Not implemented");
};
