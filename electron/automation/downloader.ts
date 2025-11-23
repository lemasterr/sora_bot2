import fs from 'fs/promises';
import path from 'path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';

import { getConfig, type Config } from '../config/config';
import { getSessionPaths } from '../sessions/repo';
import type { Session } from '../sessions/types';
import { formatTemplate, sendTelegramMessage } from '../integrations/telegram';
import { heartbeat, startWatchdog, stopWatchdog } from './watchdog';
import { registerSessionPage, unregisterSessionPage } from './selectorInspector';
import { runPostDownloadHook } from './hooks';
import { ensureDir } from '../utils/fs';
import { logInfo } from '../logging/logger';

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

const CARD_SELECTOR = "a[href*='/d/']";
const RIGHT_PANEL_SELECTOR = "div.absolute.right-0.top-0";
const KEBAB_IN_RIGHT_PANEL_SELECTOR =
  `${RIGHT_PANEL_SELECTOR} button[aria-haspopup='menu']:not([aria-label='Settings'])`;
const MENU_ROOT_SELECTOR = "[role='menu']";
const MENU_ITEM_SELECTOR = "[role='menuitem']";

const DOWNLOAD_MENU_LABELS = ['Download', 'Скачать', 'Download video', 'Save video', 'Export'];

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

async function disconnectIfExternal(browser: Browser | null): Promise<void> {
  if (!browser) return;

  const meta = browser as any;
  if (meta.__soraManaged) {
    return;
  }

  try {
    await browser.disconnect();
  } catch {
    // ignore disconnect errors
  }
}

async function configureDownloads(page: Page, downloadsDir: string): Promise<void> {
  await ensureDir(downloadsDir);
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadsDir,
  });
}

function resolveCdpEndpoint(config: Config): string {
  const envEndpoint = process.env.CDP_ENDPOINT?.trim();
  if (envEndpoint) return envEndpoint;

  const port = Number(config.cdpPort ?? DEFAULT_CDP_PORT);
  const safePort = Number.isFinite(port) ? port : DEFAULT_CDP_PORT;
  return `http://127.0.0.1:${safePort}`;
}

async function preparePage(browser: Browser, downloadDir: string): Promise<Page> {
  const context = browser.browserContexts()[0] ?? browser.defaultBrowserContext();
  const pages = await context.pages();
  const existing = pages.find((p) => p.url().startsWith('https://sora.chatgpt.com'));
  const page = existing ?? (await context.newPage());

  await configureDownloads(page, downloadDir);
  if (!page.url().startsWith('https://sora.chatgpt.com/drafts')) {
    await page.goto('https://sora.chatgpt.com/drafts', { waitUntil: 'networkidle2' });
  }
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

async function openKebabMenu(page: Page): Promise<void> {
  const kebab = await page.$(KEBAB_IN_RIGHT_PANEL_SELECTOR);
  if (!kebab) {
    throw new Error('Download menu button not found in right panel');
  }

  const box = await kebab.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await delay(150);
  }

  await kebab.click();
  await page.waitForSelector(MENU_ROOT_SELECTOR, { timeout: 8000 });
}

async function clickDownloadInMenu(page: Page): Promise<void> {
  const menuRoot = await page.$(MENU_ROOT_SELECTOR);
  if (!menuRoot) {
    throw new Error('Download menu root not found');
  }

  const items = await menuRoot.$$(MENU_ITEM_SELECTOR);
  if (items.length === 0) {
    throw new Error('No menu items found in download menu');
  }

  let candidate: any | null = null;

  for (const item of items) {
    const text = (await page.evaluate((el) => el.textContent ?? '', item)).trim();
    for (const label of DOWNLOAD_MENU_LABELS) {
      if (text.toLowerCase().includes(label.toLowerCase())) {
        candidate = item;
        break;
      }
    }
    if (candidate) break;
  }

  if (!candidate) {
    candidate = items[0];
  }

  await candidate.click();
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
    const cdpEndpoint = resolveCdpEndpoint(config);

    const connected = (await puppeteer.connect({
      browserURL: cdpEndpoint,
      defaultViewport: null,
    })) as Browser & { __soraManaged?: boolean };

    connected.__soraManaged = false;
    browser = connected;

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

    let noMoreCards = false;

    for (let index = 0; !fatalWatchdog && !noMoreCards; index += 1) {
      if (cancelFlag.cancelled) break;
      if (!page) break;

      if (hardCap > 0 && downloaded >= hardCap) {
        logInfo('downloader', `Reached download limit ${hardCap} for session ${session.name}`);
        break;
      }

      heartbeat(runId);
      assertPage(page);
      const activePage = page as any;
      if (!activePage.url().startsWith('https://sora.chatgpt.com/drafts')) {
        await activePage.goto('https://sora.chatgpt.com/drafts', { waitUntil: 'networkidle2' });
        await activePage.waitForSelector(CARD_SELECTOR, { timeout: 60_000 }).catch(() => undefined);
      }

      let cards = await activePage.$$(CARD_SELECTOR);
      const remaining = hardCap > 0 ? Math.max(hardCap - downloaded, 0) : Number.POSITIVE_INFINITY;
      if (remaining <= 0) break;

      let stagnantScrolls = 0;
      while (index >= cards.length) {
        const prevCount = cards.length;
        await activePage.evaluate(() => {
          const height = window.innerHeight || 800;
          window.scrollBy(0, Math.floor(height * 0.8));
        });
        await delay(1200);
        cards = await activePage.$$(CARD_SELECTOR);
        if (cards.length > prevCount) {
          stagnantScrolls = 0;
        } else {
          stagnantScrolls += 1;
          if (stagnantScrolls >= 3) {
            noMoreCards = true;
            break;
          }
        }
      }

      if (noMoreCards) break;
      if (cards.length === 0 || index >= cards.length) break;

      const card = cards[index];
      const title = titles[index] || `video_${index + 1}`;

      try {
        await card.click();
        await activePage.waitForSelector(RIGHT_PANEL_SELECTOR, { timeout: 60_000 });

        const downloadPromise = waitForDownload(page, config.downloadTimeoutMs);
        await openKebabMenu(activePage);
        await clickDownloadInMenu(activePage);
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
        await activePage.goto('https://sora.chatgpt.com/drafts', { waitUntil: 'networkidle2' });
        await activePage.waitForSelector(CARD_SELECTOR, { timeout: 60_000 }).catch(() => undefined);
      } catch (error) {
        // Continue to next card on error
        try {
          if (!activePage.url().startsWith('https://sora.chatgpt.com/drafts')) {
            await activePage.goto('https://sora.chatgpt.com/drafts', { waitUntil: 'networkidle2' });
            await activePage.waitForSelector(CARD_SELECTOR, { timeout: 60_000 }).catch(() => undefined);
          }
        } catch {
          // ignore navigation errors
        }
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
    await disconnectIfExternal(browser);
  }
}

export function cancelDownloads(sessionId: string): void {
  const flag = cancellationMap.get(sessionId);
  if (flag) {
    flag.cancelled = true;
  }
}
