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
import { resolveSessionCdpPort } from '../utils/ports';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertPage(page: Page | null): asserts page is Page {
  if (!page) {
    throw new Error('No active page');
  }
}

export type PromptsRunResult = {
  ok: boolean;
  submitted: number;
  failed: number;
  errorCode?: string;
  error?: string;
};

const PROMPT_SELECTOR = "textarea[data-testid='prompt-input']";
const FILE_INPUT_SELECTOR = "input[type='file']";
const SUBMIT_SELECTOR = "button[data-testid='submit']";
const DEFAULT_CDP_PORT = 9222;
const WATCHDOG_TIMEOUT_MS = 120_000;
const MAX_WATCHDOG_RESTARTS = 2;

type CancelFlag = { cancelled: boolean };
const cancellationMap = new Map<string, CancelFlag>();

async function ensureFileParentExists(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function appendLogLine(filePath: string, line: string): Promise<void> {
  await ensureFileParentExists(filePath);
  await fs.appendFile(filePath, `${line}\n`, 'utf-8');
}

async function readLines(filePath: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return raw.split(/\r?\n/);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function resolveProfile(session: Session): Promise<ChromeProfile | null> {
  const [profiles, config] = await Promise.all([scanChromeProfiles(), getConfig()]);
  if (session.chromeProfileName) {
    const preferred = profiles.find(
      (p) =>
        p.name === session.chromeProfileName &&
        (config.chromeUserDataDir ? p.userDataDir === config.chromeUserDataDir : true)
    );
    if (preferred) return preferred;

    const match = profiles.find((p) => p.name === session.chromeProfileName);
    if (match) return match;
  }
  return getActiveChromeProfile();
}

async function preparePage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  await page.goto('https://sora.chatgpt.com', { waitUntil: 'networkidle2' });
  await page.waitForSelector(PROMPT_SELECTOR, { timeout: 60_000 });
  return page;
}

export async function runPrompts(session: Session): Promise<PromptsRunResult> {
  const cancelFlag: CancelFlag = { cancelled: false };
  cancellationMap.set(session.id, cancelFlag);

  const runId = `prompts:${session.id}:${Date.now()}`;
  let browser: Browser | null = null;
  let page: Page | null = null;
  let submitted = 0;
  let failed = 0;
  let config: Config | null = null;
  let watchdogTimeouts = 0;
  let fatalWatchdog = false;

  try {
    const [loadedConfig, paths] = await Promise.all([getConfig(), getSessionPaths(session)]);
    config = loadedConfig;
    const profile = await resolveProfile(session);

    if (!profile) {
      return { ok: false, submitted, failed, error: 'No Chrome profile available' };
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
      page = await preparePage(browser);
      registerSessionPage(session.id, page);
      heartbeat(runId);
    };

    const prompts = (await readLines(paths.promptsFile)).map((line) => line.trim());
    const imagePrompts = (await readLines(paths.imagePromptsFile)).map((line) => line.trim());

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

    for (let index = 0; index < prompts.length; index += 1) {
      if (cancelFlag.cancelled || fatalWatchdog) break;

      heartbeat(runId);
      const promptText = prompts[index];
      if (!promptText || !page) continue;
      assertPage(page);
      const activePage = page as any;

      const imagePath = imagePrompts[index];

      try {
        await activePage.click(PROMPT_SELECTOR, { clickCount: 3 });
        await activePage.keyboard.press('Backspace');
        await activePage.type(PROMPT_SELECTOR, promptText);

        if (imagePath) {
          const input = await activePage.$(FILE_INPUT_SELECTOR);
          if (input) {
            await input.uploadFile(imagePath);
          }
        }

        await activePage.click(SUBMIT_SELECTOR);
        await delay(config.promptDelayMs);
        heartbeat(runId);

        submitted += 1;
        await appendLogLine(
          paths.submittedLog,
          `${new Date().toISOString()} | prompt #${index + 1} OK | ${promptText.slice(0, 80)}`
        );
      } catch (error) {
        failed += 1;
        await appendLogLine(
          paths.failedLog,
          `${new Date().toISOString()} | prompt #${index + 1} FAIL | ${promptText.slice(0, 80)} | ${String(
            error
          )}`
        );
      }
    }

    if (fatalWatchdog) {
      return { ok: false, submitted, failed, errorCode: 'watchdog_timeout', error: 'Watchdog timeout' };
    }

    return { ok: true, submitted, failed };
  } catch (error) {
    const message = (error as Error).message;
    if (config?.telegram?.enabled && config.telegramTemplates?.sessionError) {
      const lower = message.toLowerCase();
      if (!lower.includes('cloudflare')) {
        const text = formatTemplate(config.telegramTemplates.sessionError, {
          session: session.id,
          submitted,
          failed,
          downloaded: 0,
          durationMinutes: 0,
          error: message,
        });
        await sendTelegramMessage(text);
      }
    }
    return { ok: false, submitted, failed, error: message };
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
        } catch (closeError) {
          // ignore close errors
        }
      }
    }
  }
}

export function cancelPrompts(sessionId: string): void {
  const flag = cancellationMap.get(sessionId);
  if (flag) {
    flag.cancelled = true;
  }
}
