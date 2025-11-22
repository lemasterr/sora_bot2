import type { Session } from '../sessions/types';

export type DownloadRunResult = {
  ok: boolean;
  downloaded: number;
  error?: string;
};

export async function runDownloads(_session: Session, _maxVideos: number): Promise<DownloadRunResult> {
  // TODO: implement download automation
  throw new Error('Not implemented');
}

export function cancelDownloads(_sessionId: string): void {
  // TODO: cancel an in-flight download run
}
