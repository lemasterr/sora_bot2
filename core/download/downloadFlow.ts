import fs from 'fs/promises';
import path from 'path';
import type { Page } from 'puppeteer-core';

const CARD_SELECTOR = "a[href*='/d/']";
const RIGHT_PANEL_SELECTOR = "div.absolute.right-0.top-0";
const KEBAB_IN_RIGHT_PANEL_SELECTOR =
  `${RIGHT_PANEL_SELECTOR} button[aria-haspopup='menu']:not([aria-label='Settings'])`;
const MENU_ROOT_SELECTOR = "[role='menu']";
const MENU_ITEM_SELECTOR = "[role='menuitem']";

const DOWNLOAD_MENU_LABELS = ['Download', 'Скачать', 'Download video', 'Save video', 'Export'];

const READY_TIMEOUT_MS = 60_000;
const DOWNLOAD_START_TIMEOUT_MS = 30_000;
const FILE_SAVE_TIMEOUT_MS = 30_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDownloadStart(
  downloadDir: string,
  seenNames: Set<string>,
  timeoutMs: number
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const entries = await fs.readdir(downloadDir);
      const candidate = entries.find((name) => !seenNames.has(name));
      if (candidate) {
        return path.join(downloadDir, candidate);
      }
    } catch {
      // ignore polling errors
    }
    await delay(300);
  }

  throw new Error('Download did not start before timeout');
}

async function waitUntilFileSaved(
  downloadDir: string,
  startedAt: number,
  timeoutMs: number
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let newest: string | null = null;

  while (Date.now() < deadline) {
    try {
      const entries = await fs.readdir(downloadDir);
      const mp4s = await Promise.all(
        entries
          .filter((name) => name.toLowerCase().endsWith('.mp4'))
          .map(async (name) => {
            const full = path.join(downloadDir, name);
            const stats = await fs.stat(full);
            return { full, stats };
          })
      );

      const candidate = mp4s
        .filter((entry) => entry.stats.mtimeMs >= startedAt)
        .sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs)[0];

      if (candidate) {
        newest = candidate.full;
        break;
      }
    } catch {
      // ignore polling errors
    }

    await delay(200);
  }

  if (!newest) {
    throw new Error('Download file not saved before timeout');
  }

  return newest;
}

async function openFirstCard(page: Page): Promise<void> {
  await page.waitForSelector(CARD_SELECTOR, { timeout: READY_TIMEOUT_MS });
  const cards = await page.$$(CARD_SELECTOR);
  if (!cards.length) {
    throw new Error('No cards available to open');
  }

  await cards[0].click();
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: READY_TIMEOUT_MS }).catch(() => undefined);
  await page.waitForSelector(RIGHT_PANEL_SELECTOR, { timeout: READY_TIMEOUT_MS });
}

async function ensureKebabMenu(page: Page): Promise<void> {
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

async function clickDownload(page: Page, downloadButtonSelector: string): Promise<void> {
  const direct = await page.$(downloadButtonSelector);
  if (direct) {
    await direct.click();
    return;
  }

  await ensureKebabMenu(page);
  const menuRoot = await page.$(MENU_ROOT_SELECTOR);
  if (!menuRoot) {
    throw new Error('Download menu root not found');
  }

  const directInMenu = await menuRoot.$(downloadButtonSelector);
  if (directInMenu) {
    await directInMenu.click();
    return;
  }

  const items = await menuRoot.$$(MENU_ITEM_SELECTOR);
  if (!items.length) {
    throw new Error('No menu items found in download menu');
  }

  let candidate: any | null = null;
  for (const item of items) {
    const text = (await page.evaluate((el) => el.textContent ?? '', item)).trim();
    if (DOWNLOAD_MENU_LABELS.some((label) => text.toLowerCase().includes(label.toLowerCase()))) {
      candidate = item;
      break;
    }
  }

  if (!candidate) {
    candidate = items[0];
  }

  await candidate.click();
}

async function waitUntilCardReady(page: Page, waitForReadySelectors: string[]): Promise<void> {
  const selectors = waitForReadySelectors.length ? waitForReadySelectors : [RIGHT_PANEL_SELECTOR];
  for (const selector of selectors) {
    await page.waitForSelector(selector, { timeout: READY_TIMEOUT_MS });
  }
  await delay(250);
}

export enum DownloadState {
  Idle,
  OpenFirstCard,
  WaitCardReady,
  StartDownload,
  WaitDownloadStart,
  WaitFileSaved,
  SwipeNext,
  Done,
}

export type DownloadLoopResult = {
  completed: number;
  savedFiles: string[];
  lastState: DownloadState;
};

export async function runDownloadLoop(options: {
  page: Page;
  maxDownloads: number;
  downloadDir: string;
  waitForReadySelectors: string[];
  downloadButtonSelector: string;
  swipeNext: () => Promise<void>;
  onStateChange?: (state: DownloadState) => void;
  isCancelled?: () => boolean;
}): Promise<DownloadLoopResult> {
  const { page, maxDownloads, downloadDir, waitForReadySelectors, downloadButtonSelector, swipeNext, onStateChange, isCancelled } = options;

  let state: DownloadState = DownloadState.Idle;
  const savedFiles: string[] = [];
  await fs.mkdir(downloadDir, { recursive: true });

  const notify = (next: DownloadState) => {
    state = next;
    onStateChange?.(state);
  };

  notify(DownloadState.OpenFirstCard);
  await openFirstCard(page);

  const seenNames = new Set<string>(await fs.readdir(downloadDir).catch(() => []));

  while (savedFiles.length < maxDownloads) {
    if (isCancelled?.()) {
      break;
    }

    notify(DownloadState.WaitCardReady);
    await waitUntilCardReady(page, waitForReadySelectors);

    notify(DownloadState.StartDownload);
    const startedAt = Date.now();
    const beforeStartNames = new Set(seenNames);

    await clickDownload(page, downloadButtonSelector);

    notify(DownloadState.WaitDownloadStart);
    const startedFile = await waitForDownloadStart(downloadDir, beforeStartNames, DOWNLOAD_START_TIMEOUT_MS);
    seenNames.add(path.basename(startedFile));

    notify(DownloadState.WaitFileSaved);
    const savedPath = await waitUntilFileSaved(downloadDir, startedAt, FILE_SAVE_TIMEOUT_MS);
    seenNames.add(path.basename(savedPath));
    savedFiles.push(savedPath);

    if (savedFiles.length >= maxDownloads) {
      notify(DownloadState.Done);
      break;
    }

    notify(DownloadState.SwipeNext);
    await swipeNext();
  }

  if (state !== DownloadState.Done && savedFiles.length >= maxDownloads) {
    state = DownloadState.Done;
  }

  return { completed: savedFiles.length, savedFiles, lastState: state };
}
