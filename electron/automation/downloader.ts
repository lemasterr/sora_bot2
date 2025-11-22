import fs from 'fs/promises';
import path from 'path';
import type { Browser, Page } from 'puppeteer-core';

import { launchBrowserForSession } from '../chrome/cdp';
import { getActiveChromeProfile, scanChromeProfiles, type ChromeProfile } from '../chrome/profiles';
import { getConfig } from '../config/config';
import { getSessionPaths } from '../sessions/repo';
import type { Session } from '../sessions/types';

export type DownloadRunResult = {
  ok: boolean;
  downloaded: number;
  error?: string;
};

const CARD_SELECTOR = '.sora-draft-card';
const DOWNLOAD_BUTTON_SELECTOR = "button[data-testid='download']";
const DEFAULT_CDP_PORT = 9222;

type CancelFlag = { cancelled: boolean };
const cancellationMap = new Map<string, CancelFlag>();

async function ensureDir(target: string): Promise<void> {
  await fs.mkdir(target, { recursive: true });
}

async function readLines(filePath: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return raw.split(/\r?\n/).map((line) => line.trim());
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function safeFileName(title: string): string {
  const sanitized = title.replace(/[\\/:*?"<>|]/g, '_');
  return sanitized.length > 80 ? sanitized.slice(0, 80) : sanitized;
}

async function resolveProfile(session: Session): Promise<ChromeProfile | null> {
  if (session.chromeProfileName) {
    const profiles = await scanChromeProfiles();
    const match = profiles.find((p) => p.name === session.chromeProfileName);
    if (match) return match;
  }
  return getActiveChromeProfile();
}

async function configureDownloads(page: Page, downloadsDir: string): Promise<void> {
  await ensureDir(downloadsDir);
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadsDir,
  });
}

async function preparePage(browser: Browser, downloadDir: string): Promise<Page> {
  const page = await browser.newPage();
  await configureDownloads(page, downloadDir);
  await page.goto('https://sora.chatgpt.com/drafts', { waitUntil: 'networkidle2' });
  await page.waitForSelector(CARD_SELECTOR, { timeout: 60_000 }).catch(() => undefined);
  return page;
}

async function waitForDownload(page: Page, timeoutMs: number): Promise<void> {
  const client = await page.target().createCDPSession();

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Download timed out'));
    }, timeoutMs);

    const handler = (event: { state?: string }) => {
      if (event.state === 'completed') {
        cleanup();
        resolve();
      } else if (event.state === 'canceled') {
        cleanup();
        reject(new Error('Download canceled'));
      }
    };

    const cleanup = () => {
      clearTimeout(timeout);
      client.off('Page.downloadProgress', handler as never);
    };

    client.on('Page.downloadProgress', handler as never);
  });
}

async function findLatestMp4(downloadDir: string): Promise<string | null> {
  const entries = await fs.readdir(downloadDir, { withFileTypes: true });
  let latest: { file: string; mtime: number } | null = null;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith('.mp4')) continue;

    const fullPath = path.join(downloadDir, entry.name);
    const stats = await fs.stat(fullPath);

    if (!latest || stats.mtimeMs > latest.mtime) {
      latest = { file: fullPath, mtime: stats.mtimeMs };
    }
  }

  return latest?.file ?? null;
}

export async function runDownloads(session: Session, maxVideos: number): Promise<DownloadRunResult> {
  const cancelFlag: CancelFlag = { cancelled: false };
  cancellationMap.set(session.id, cancelFlag);

  let browser: Browser | null = null;
  let downloaded = 0;

  try {
    const [config, paths] = await Promise.all([getConfig(), getSessionPaths(session)]);
    const profile = await resolveProfile(session);

    if (!profile) {
      return { ok: false, downloaded, error: 'No Chrome profile available' };
    }

    const cdpPort = session.cdpPort ?? (config as Partial<{ cdpPort: number }>).cdpPort ?? DEFAULT_CDP_PORT;
    browser = await launchBrowserForSession(profile, cdpPort);
    const page = await preparePage(browser, paths.downloadDir);

    const cards = await page.$$(CARD_SELECTOR);
    const titles = await readLines(paths.titlesFile);

    const limit = Math.min(
      cards.length,
      titles.length,
      Number.isFinite(maxVideos) && maxVideos > 0 ? maxVideos : Number.POSITIVE_INFINITY
    );

    for (let index = 0; index < limit; index += 1) {
      if (cancelFlag.cancelled) break;

      const card = cards[index];
      const title = titles[index] || `video_${index + 1}`;

      try {
        await card.click();
        await page.waitForSelector(DOWNLOAD_BUTTON_SELECTOR, { timeout: 60_000 });

        const downloadPromise = waitForDownload(page, config.downloadTimeoutMs);
        await page.click(DOWNLOAD_BUTTON_SELECTOR);
        await downloadPromise;

        const latest = await findLatestMp4(paths.downloadDir);
        if (latest) {
          const targetName = `${safeFileName(title)}.mp4`;
          const targetPath = path.join(paths.downloadDir, targetName);
          if (latest !== targetPath) {
            await fs.rename(latest, targetPath);
          }
        }

        downloaded += 1;
      } catch (error) {
        // Continue to next card on error
      }

      await page.waitForTimeout(1000);
    }

    return { ok: true, downloaded };
  } catch (error) {
    return { ok: false, downloaded, error: (error as Error).message };
  } finally {
    cancellationMap.delete(session.id);
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }
  }
}

export function cancelDownloads(sessionId: string): void {
  const flag = cancellationMap.get(sessionId);
  if (flag) {
    flag.cancelled = true;
  }
}
