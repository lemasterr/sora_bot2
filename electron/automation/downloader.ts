import fs from 'fs/promises';
import path from 'path';
import { type Browser, type Page } from 'puppeteer-core';

import { getConfig, type Config } from '../config/config';
import { getSessionPaths } from '../sessions/repo';
import type { Session } from '../sessions/types';
import { formatTemplate, sendTelegramMessage } from '../integrations/telegram';
import { heartbeat, startWatchdog, stopWatchdog } from './watchdog';
import { registerSessionPage, unregisterSessionPage } from './selectorInspector';
import { runPostDownloadHook } from './hooks';
import { ensureDir } from '../utils/fs';
import { logInfo } from '../logging/logger';
import { ensureBrowserForSession } from './sessionChrome';

enum DownloadState {
  Idle = 'idle',
  WaitCardReady = 'wait_card_ready',
  StartDownload = 'start_download',
  WaitDownloadStart = 'wait_download_start',
  WaitFileSaved = 'wait_file_saved',
  SwipeNext = 'swipe_next',
}

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

async function preparePage(browser: Browser, downloadDir: string): Promise<Page> {
  const context = browser.browserContexts()[0] ?? browser.defaultBrowserContext();
  const pages = await context.pages();
  const existing = pages.find((p) => p.url().startsWith('https://sora.chatgpt.com'));
  const page = existing ?? (await context.newPage());

  await configureDownloads(page, downloadDir);
  const draftsUrl = 'https://sora.chatgpt.com/drafts';
  if (!page.url().startsWith(draftsUrl)) {
    await page.goto(draftsUrl, { waitUntil: 'networkidle2' });
  }
  await page.waitForSelector(CARD_SELECTOR, { timeout: 60_000 }).catch(() => undefined);
  return page;
}

async function waitForDownloadStart(page: Page, timeoutMs: number): Promise<boolean> {
  const client = await page.target().createCDPSession();
  await client.send('Page.enable').catch(() => undefined);

  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);

    const handler = (event: { state?: string }) => {
      if (event.state === 'inProgress' || event.state === 'completed') {
        cleanup();
        resolve(true);
      } else if (event.state === 'canceled') {
        cleanup();
        resolve(false);
      }
    };

    const cleanup = () => {
      clearTimeout(timeout);
      client.off('Page.downloadProgress', handler as never);
    };

    client.on('Page.downloadProgress', handler as never);
  });
}

async function waitUntilFileSavedOrTimeout(
  downloadDir: string,
  startedAt: number,
  timeoutMs: number
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const entries = await fs.readdir(downloadDir);
      const mp4s = await Promise.all(
        entries
          .filter((name) => name.toLowerCase().endsWith('.mp4'))
          .map(async (name) => ({
            name,
            full: path.join(downloadDir, name),
            stats: await fs.stat(path.join(downloadDir, name)),
          }))
      );

      const candidate = mp4s
        .filter((entry) => entry.stats.mtimeMs >= startedAt)
        .sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs)[0];

      if (candidate) {
        return candidate.full;
      }
    } catch {
      // ignore polling errors
    }

    await delay(300);
  }

  return null;
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

async function waitUntilCardReady(page: Page): Promise<void> {
  await page.waitForSelector(RIGHT_PANEL_SELECTOR, { timeout: 60_000 });
  // give the player a brief moment to settle before interacting
  await delay(250);
}

async function startDownloadForCurrentCard(page: Page): Promise<void> {
  await openKebabMenu(page);
  await clickDownloadInMenu(page);
}

async function getCurrentVideoSignature(page: Page): Promise<string> {
  return page.evaluate(() => {
    const video = document.querySelector('video') as HTMLVideoElement | null;
    const src = video?.currentSrc || video?.src || '';
    const path = window.location.pathname || '';
    const poster = video?.getAttribute('poster') ?? '';
    return `${path}::${src}::${poster}`;
  });
}

async function longSwipeOnce(page: Page): Promise<void> {
  const viewport = page.viewport() ?? { width: 1280, height: 720 };

  try {
    await page.mouse.move(viewport.width / 2, viewport.height * 0.35);
  } catch {
    // ignore
  }

  const wheel = async (delta: number): Promise<void> => {
    try {
      await page.mouse.wheel({ deltaY: delta });
    } catch {
      await page.evaluate((d) => {
        window.scrollBy(0, d);
      }, delta);
    }
  };

  let performed = false;
  for (let i = 0; i < 3; i += 1) {
    await wheel(900);
    performed = true;
    await delay(160);
  }

  if (!performed) {
    await wheel(2400);
  }

  await delay(820);
}

async function keyNudgeForNextCard(page: Page): Promise<void> {
  try {
    await page.keyboard.press('PageDown');
    await delay(240);
    await page.keyboard.press('ArrowDown');
  } catch {
    // ignore key nudges if focus is missing
  }
  await delay(520);
}

async function scrollToNextCardInFeed(
  page: Page,
  pauseMs = 1800,
  timeoutMs = 9000
): Promise<boolean> {
  const startUrl = page.url();
  const startSig = await getCurrentVideoSignature(page);

  const waitForChange = async (totalMs: number): Promise<boolean> => {
    const deadline = Date.now() + totalMs;
    while (Date.now() < deadline) {
      const [url, sig] = await Promise.all([
        Promise.resolve(page.url()),
        getCurrentVideoSignature(page),
      ]);
      if (url !== startUrl || sig !== startSig) {
        return true;
      }
      await delay(180);
    }
    const [finalUrl, finalSig] = await Promise.all([
      Promise.resolve(page.url()),
      getCurrentVideoSignature(page),
    ]);
    return finalUrl !== startUrl || finalSig !== startSig;
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await longSwipeOnce(page);
    if (await waitForChange(Math.floor(timeoutMs * 0.6))) {
      try {
        await page.waitForSelector(RIGHT_PANEL_SELECTOR, { timeout: 6500 });
      } catch {
        // ignore
      }
      return true;
    }
    await keyNudgeForNextCard(page);
    await delay(Math.floor(pauseMs * 0.9));
  }

  await page.evaluate(() => {
    window.scrollBy(0, window.innerHeight * 0.95);
  });
  await keyNudgeForNextCard(page);
  await delay(900);
  if (await waitForChange(Math.floor(timeoutMs * 0.9))) {
    try {
      await page.waitForSelector(RIGHT_PANEL_SELECTOR, { timeout: 6500 });
    } catch {
      // ignore
    }
    return true;
  }

  return false;
}

/**
 * Download videos for a session using the TikTok-style viewer flow. Shared by session actions and pipeline steps.
 */
export async function runDownloads(
  session: Session,
  maxVideos = 0,
  externalCancelFlag?: CancelFlag
): Promise<DownloadRunResult> {
  const cancelFlag: CancelFlag = externalCancelFlag ?? { cancelled: false };
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

    const { browser: connected } = await ensureBrowserForSession(session, config);
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

    const draftsUrl = 'https://sora.chatgpt.com/drafts';
    const seenUrls = new Set<string>();

    if (page) {
      assertPage(page);
      const activePage: Page = page;

      await activePage.goto(draftsUrl, { waitUntil: 'networkidle2' }).catch(() => undefined);
      await activePage.waitForSelector(CARD_SELECTOR, { timeout: 60_000 }).catch(() => undefined);

      const cards = await activePage.$$(CARD_SELECTOR);
      if (cards.length === 0) {
        logInfo('downloader', `No draft cards found in drafts for session ${session.name}`);
        return { ok: true, downloaded };
      }

      await cards[0].click();
      await activePage.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => undefined);
      await activePage.waitForSelector(RIGHT_PANEL_SELECTOR, { timeout: 60_000 }).catch(() => undefined);
    }

    while (!fatalWatchdog && !cancelFlag.cancelled) {
      if (!page) break;

      if (hardCap > 0 && downloaded >= hardCap) {
        logInfo('downloader', `Reached download limit ${hardCap} for session ${session.name}`);
        break;
      }

      heartbeat(runId);
      assertPage(page);
      const activePage: Page = page;

      const currentUrl = activePage.url();
      if (seenUrls.has(currentUrl)) {
        const moved = await scrollToNextCardInFeed(activePage);
        if (!moved) {
          logInfo('downloader', '[Feed] Current card URL already seen, stopping.');
          break;
        }
        continue;
      }
      seenUrls.add(currentUrl);

      const titleFromList = titles[downloaded];
      const titleFromPage = (await activePage.title()) || '';
      const title = titleFromList || titleFromPage || `video_${downloaded + 1}`;

      let state: DownloadState = DownloadState.WaitCardReady;
      let attempts = 0;
      const maxAttempts = 2;
      let savedPath: string | null = null;

      while (attempts < maxAttempts && !cancelFlag.cancelled) {
        try {
          await waitUntilCardReady(activePage);
          state = DownloadState.StartDownload;
          const startedAt = Date.now();

          await startDownloadForCurrentCard(activePage);

          state = DownloadState.WaitDownloadStart;
          const downloadStarted = await waitForDownloadStart(
            activePage,
            Math.min(Math.max(config.downloadTimeoutMs / 3, 5000), config.downloadTimeoutMs)
          );
          if (!downloadStarted) {
            throw new Error('Download did not start');
          }

          state = DownloadState.WaitFileSaved;
          savedPath = await waitUntilFileSavedOrTimeout(paths.downloadDir, startedAt, config.downloadTimeoutMs);
          if (!savedPath) {
            throw new Error('Download file not saved before timeout');
          }

          break;
        } catch (error) {
          attempts += 1;
          const message = (error as Error)?.message ?? String(error);
          logInfo(
            'downloader',
            `[Feed] Download attempt ${attempts}/${maxAttempts} failed at state ${state}: ${message}`
          );
          if (attempts >= maxAttempts) break;
          await delay(800);
        }
      }

      if (savedPath) {
        const targetName = `${safeFileName(title)}.mp4`;
        const targetPath = path.join(paths.downloadDir, targetName);
        if (savedPath !== targetPath) {
          try {
            await fs.rename(savedPath, targetPath);
          } catch {
            // fallback: keep original path
          }
        }

        const finalPath = fs
          .access(targetPath)
          .then(() => targetPath)
          .catch(() => savedPath ?? targetPath);

        await runPostDownloadHook(await finalPath, title);
        downloaded += 1;
        logInfo('downloader', `[Feed] Downloaded ${downloaded} videos for session ${session.name}`);
      }

      if (hardCap > 0 && downloaded >= hardCap) {
        logInfo('downloader', `Reached download limit ${hardCap} for session ${session.name}`);
        break;
      }

      const moved = await scrollToNextCardInFeed(activePage);
      if (!moved) {
        logInfo('downloader', '[Feed] Could not scroll to next card — stopping.');
        break;
      }

      heartbeat(runId);
      await delay(600);
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
