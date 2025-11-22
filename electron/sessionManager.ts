import fs from 'fs/promises';
import path from 'path';
import type { DownloadedVideo, SessionFiles, SessionInfo } from '../shared/types';

const SESSION_FILES = {
  prompts: 'prompts.txt',
  imagePrompts: 'image_prompts.txt',
  titles: 'titles.txt',
  submittedLog: 'submitted.log',
  failedLog: 'failed.log'
};

export class SessionManager {
  private sessionsRoot: string;

  constructor(sessionsRoot: string) {
    this.sessionsRoot = sessionsRoot;
  }

  setSessionsRoot(root: string) {
    this.sessionsRoot = root;
  }

  private async ensureRoot() {
    await fs.mkdir(this.sessionsRoot, { recursive: true });
  }

  private sessionPath(name: string) {
    return path.join(this.sessionsRoot, name);
  }

  private async readLines(filePath: string): Promise<string[]> {
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return data
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async writeLines(filePath: string, lines: string[]) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const content = lines.join('\n');
    await fs.writeFile(filePath, content, 'utf-8');
  }

  private async initializeSessionFiles(sessionDir: string) {
    await fs.mkdir(sessionDir, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(sessionDir, SESSION_FILES.prompts), '', { flag: 'a' }),
      fs.writeFile(path.join(sessionDir, SESSION_FILES.imagePrompts), '', { flag: 'a' }),
      fs.writeFile(path.join(sessionDir, SESSION_FILES.titles), '', { flag: 'a' }),
      fs.writeFile(path.join(sessionDir, SESSION_FILES.submittedLog), '', { flag: 'a' }),
      fs.writeFile(path.join(sessionDir, SESSION_FILES.failedLog), '', { flag: 'a' }),
      fs.mkdir(path.join(sessionDir, 'downloads'), { recursive: true }),
      fs.mkdir(path.join(sessionDir, 'profile'), { recursive: true })
    ]);
  }

  async getSessionPaths(name: string): Promise<{ sessionPath: string; profileDir: string; downloadsDir: string }> {
    await this.ensureRoot();
    const sessionDir = this.sessionPath(name);

    try {
      const stats = await fs.stat(sessionDir);
      if (!stats.isDirectory()) {
        throw new Error(`Session ${name} is not a directory`);
      }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        throw new Error(`Session ${name} not found`);
      }
      throw error;
    }

    await this.initializeSessionFiles(sessionDir);

    return {
      sessionPath: sessionDir,
      profileDir: path.join(sessionDir, 'profile'),
      downloadsDir: path.join(sessionDir, 'downloads')
    };
  }

  async listSessions(): Promise<SessionInfo[]> {
    await this.ensureRoot();
    const entries = await fs.readdir(this.sessionsRoot, { withFileTypes: true });

    const sessions = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const sessionDir = this.sessionPath(entry.name);
          const prompts = await this.readLines(path.join(sessionDir, SESSION_FILES.prompts));
          const titles = await this.readLines(path.join(sessionDir, SESSION_FILES.titles));

          const info: SessionInfo = {
            name: entry.name,
            path: sessionDir,
            hasFiles: prompts.length > 0 || titles.length > 0,
            promptCount: prompts.length,
            titleCount: titles.length
          };

          return info;
        })
    );

    return sessions;
  }

  async createSession(name: string): Promise<SessionInfo> {
    await this.ensureRoot();
    const sessionDir = this.sessionPath(name);
    await this.initializeSessionFiles(sessionDir);
    return {
      name,
      path: sessionDir,
      hasFiles: false,
      promptCount: 0,
      titleCount: 0
    };
  }

  async deleteSession(name: string): Promise<void> {
    await this.ensureRoot();
    const sessionDir = this.sessionPath(name);
    await fs.rm(sessionDir, { recursive: true, force: true });
  }

  async readSessionFiles(name: string): Promise<SessionFiles> {
    const sessionDir = this.sessionPath(name);
    return {
      prompts: await this.readLines(path.join(sessionDir, SESSION_FILES.prompts)),
      imagePrompts: await this.readLines(path.join(sessionDir, SESSION_FILES.imagePrompts)),
      titles: await this.readLines(path.join(sessionDir, SESSION_FILES.titles))
    };
  }

  async writeSessionFiles(name: string, data: SessionFiles): Promise<void> {
    const sessionDir = this.sessionPath(name);
    await this.initializeSessionFiles(sessionDir);
    await Promise.all([
      this.writeLines(path.join(sessionDir, SESSION_FILES.prompts), data.prompts),
      this.writeLines(path.join(sessionDir, SESSION_FILES.imagePrompts), data.imagePrompts),
      this.writeLines(path.join(sessionDir, SESSION_FILES.titles), data.titles)
    ]);
  }

  async listDownloadedVideos(): Promise<DownloadedVideo[]> {
    await this.ensureRoot();
    const entries = await fs.readdir(this.sessionsRoot, { withFileTypes: true });
    const videos: DownloadedVideo[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const sessionDir = this.sessionPath(entry.name);
      const downloadsDir = path.join(sessionDir, 'downloads');
      try {
        const files = await fs.readdir(downloadsDir, { withFileTypes: true });
        for (const file of files) {
          if (!file.isFile() || !file.name.toLowerCase().endsWith('.mp4')) continue;
          const fullPath = path.join(downloadsDir, file.name);
          const stats = await fs.stat(fullPath);
          videos.push({
            path: fullPath,
            fileName: file.name,
            sessionName: entry.name,
            mtime: stats.mtimeMs
          });
        }
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
          continue;
        }
        throw error;
      }
    }

    return videos.sort((a, b) => b.mtime - a.mtime);
  }
}
