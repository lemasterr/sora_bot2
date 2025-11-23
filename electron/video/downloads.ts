import fs from 'fs/promises';
import path from 'path';

import type { DownloadedVideo } from '../../shared/types';
import { logError } from '../logging/logger';
import { getSessionPaths, listSessions } from '../sessions/repo';
import type { Session } from '../sessions/types';

export async function listDownloadedVideos(): Promise<DownloadedVideo[]> {
  const sessions = await listSessions();
  const videos: DownloadedVideo[] = [];

  for (const session of sessions) {
    try {
      const paths = await getSessionPaths(session as Session);
      const entries = await fs.readdir(paths.downloadDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.mp4')) continue;

        const fullPath = path.join(paths.downloadDir, entry.name);
        const stats = await fs.stat(fullPath);

        videos.push({
          path: fullPath,
          fileName: entry.name,
          sessionName: session.name,
          mtime: stats.mtimeMs,
        });
      }
    } catch (error) {
      logError('downloads', `listDownloadedVideos:${session.name} ${(error as Error).message}`);
    }
  }

  return videos.sort((a, b) => b.mtime - a.mtime);
}
