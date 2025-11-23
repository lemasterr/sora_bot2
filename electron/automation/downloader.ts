import fs from 'fs/promises';
import path from 'path';
import type { Browser, Page } from 'puppeteer-core';

import { launchBrowserForSession } from '../chrome/cdp';
import { getActiveChromeProfile, scanChromeProfiles, type ChromeProfile } from '../chrome/profiles';
import { getConfig, type Config } from '../config/config';
import { getSessionPaths } from '../sessions/repo';
import type { Session } from '../sessions/types';
import { formatTemplate, sendTelegramMessage } from '../integrations/telegram';
import { heartbeat, startWatchdog, stopWatchdog } from './watchdog';
import { registerSessionPage, unregisterSessionPage } from './selectorInspector';
import { runPostDownloadHook } from './hooks';
import { ensureDir } from '../utils/fs';
import { logInfo } from '../logging/logger';
import { resolveSessionCdpPort } from '../utils/ports';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertPage(page: Page | null): asserts page is Page {
  if (!page) {
    throw new Error('No active page');
  }
}

export type DownloadRunResult = {
  ok: boolean;
  downloaded: number;
  errorCode?: string;
  error?: string;
};

const CARD_SELECTOR = '.sora-draft-card';
const DOWNLOAD_BUTTON_SELECTOR = "button[data-testid='download']";
const DEFAULT_CDP_PORT = 9222;
const WATCHDOG_TIMEOUT_MS = 120_000;
const MAX_WATCHDOG_RESTARTS = 2;

type CancelFlag = { cancelled: boolean };
const cancellationMap = new Map<string, CancelFlag>();

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

export async function runDownloads(session: Session, maxVideos = 0): Promise<DownloadRunResult> {
  const cancelFlag: CancelFlag = { cancelled: false };
  cancellationMap.set(session.id, cancelFlag);

  const runId = `download:${session.id}:${Date.now()}`;
  let browser: Browser | null = null;
  let page: Page | null = null;
  let downloaded = 0;
  let config: Config | null = null;
  let watchdogTimeouts = 0;
  let fatalWatchdog = false;

  try {
    const [loadedConfig, paths] = await Promise.all([getConfig(), getSessionPaths(session)]);
    config = loadedConfig;
    const profile = await resolveProfile(session);

    if (!profile) {
      return { ok: false, downloaded, error: 'No Chrome profile available' };
    }

    const cdpPort = resolveSessionCdpPort(session, (config as Partial<{ cdpPort: number }>).cdpPort ?? DEFAULT_CDP_PORT);
    browser = await launchBrowserForSession(profile, cdpPort);

    const prepare = async () => {
      if (!browser) return;
      if (page) {
        try {
          unregisterSessionPage(session.id, page);
          await page.close();
        } catch {
          // ignore
        }
      }
      page = await preparePage(browser, paths.downloadDir);
      registerSessionPage(session.id, page);
      heartbeat(runId);
    };

    const titles = await readLines(paths.titlesFile);

    const onTimeout = async () => {
      watchdogTimeouts += 1;
      if (watchdogTimeouts >= MAX_WATCHDOG_RESTARTS) {
        fatalWatchdog = true;
        return;
      }
      await prepare();
      setTimeout(() => startWatchdog(runId, WATCHDOG_TIMEOUT_MS, onTimeout), 0);
    };

    await prepare();
    startWatchdog(runId, WATCHDOG_TIMEOUT_MS, onTimeout);

    const explicitCap = Number.isFinite(maxVideos) && maxVideos > 0 ? maxVideos : 0;
    const fallbackCap = Number.isFinite(session.maxVideos) && session.maxVideos > 0 ? session.maxVideos : 0;
    const hardCap = explicitCap > 0 ? explicitCap : fallbackCap;

    for (let index = 0; !fatalWatchdog; index += 1) {
      if (cancelFlag.cancelled) break;
      if (!page) break;

      if (hardCap > 0 && downloaded >= hardCap) {
        logInfo('downloader', `Reached download limit ${hardCap} for session ${session.name}`);
        break;
      }

      heartbeat(runId);
      assertPage(page);
      const activePage = page as any;
      const cards = await activePage.$$(CARD_SELECTOR);
      const remaining = hardCap > 0 ? Math.max(hardCap - downloaded, 0) : Number.POSITIVE_INFINITY;
      const maxCount = Math.min(cards.length, titles.length, remaining);
      if (cards.length === 0 || index >= maxCount) break;

      const card = cards[index];
      const title = titles[index] || `video_${index + 1}`;

      try {
        await card.click();
        await activePage.waitForSelector(DOWNLOAD_BUTTON_SELECTOR, { timeout: 60_000 });

        const downloadPromise = waitForDownload(page, config.downloadTimeoutMs);
        await activePage.click(DOWNLOAD_BUTTON_SELECTOR);
        await downloadPromise;

        const latest = await findLatestMp4(paths.downloadDir);
        if (latest) {
          const targetName = `${safeFileName(title)}.mp4`;
          const targetPath = path.join(paths.downloadDir, targetName);
          if (latest !== targetPath) {
            await fs.rename(latest, targetPath);
          }
          await runPostDownloadHook(targetPath, title);
        }

        downloaded += 1;
      } catch (error) {
        // Continue to next card on error
      }

      heartbeat(runId);
      await delay(1000);
    }

    if (fatalWatchdog) {
      return { ok: false, downloaded, errorCode: 'watchdog_timeout', error: 'Watchdog timeout' };
    }

    return { ok: true, downloaded };
  } catch (error) {
    const message = (error as Error).message;
    if (config?.telegram?.enabled && config.telegramTemplates?.sessionError) {
      const lower = message.toLowerCase();
      if (!lower.includes('cloudflare')) {
        const text = formatTemplate(config.telegramTemplates.sessionError, {
          session: session.id,
          submitted: 0,
          failed: 0,
          downloaded,
          durationMinutes: 0,
          error: message,
        });
        await sendTelegramMessage(text);
      }
    }
    return { ok: false, downloaded, error: message };
  } finally {
    stopWatchdog(runId);
    cancellationMap.delete(session.id);
    unregisterSessionPage(session.id, page);
    if (browser) {
      const meta = browser as any;
      const wasExisting = meta.__soraAlreadyRunning === true || meta.__soraManaged === true;
      if (!wasExisting) {
        try {
          await browser.close();
        } catch {
          // ignore
        }
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
