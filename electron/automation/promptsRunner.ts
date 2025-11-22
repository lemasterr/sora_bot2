import fs from 'fs/promises';
import path from 'path';
import type { Browser, Page } from 'puppeteer-core';

import { launchBrowserForSession } from '../chrome/cdp';
import { getActiveChromeProfile, scanChromeProfiles, type ChromeProfile } from '../chrome/profiles';
import { getConfig } from '../config/config';
import { getSessionPaths } from '../sessions/repo';
import type { Session } from '../sessions/types';

export type PromptsRunResult = {
  ok: boolean;
  submitted: number;
  failed: number;
  error?: string;
};

const PROMPT_SELECTOR = "textarea[data-testid='prompt-input']";
const FILE_INPUT_SELECTOR = "input[type='file']";
const SUBMIT_SELECTOR = "button[data-testid='submit']";
const DEFAULT_CDP_PORT = 9222;

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
  if (session.chromeProfileName) {
    const profiles = await scanChromeProfiles();
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

  let browser: Browser | null = null;
  let submitted = 0;
  let failed = 0;

  try {
    const [config, paths] = await Promise.all([getConfig(), getSessionPaths(session)]);
    const profile = await resolveProfile(session);

    if (!profile) {
      return { ok: false, submitted, failed, error: 'No Chrome profile available' };
    }

    const cdpPort = session.cdpPort ?? (config as Partial<{ cdpPort: number }>).cdpPort ?? DEFAULT_CDP_PORT;
    browser = await launchBrowserForSession(profile, cdpPort);
    const page = await preparePage(browser);

    const prompts = (await readLines(paths.promptsFile)).map((line) => line.trim());
    const imagePrompts = (await readLines(paths.imagePromptsFile)).map((line) => line.trim());

    for (let index = 0; index < prompts.length; index += 1) {
      if (cancelFlag.cancelled) break;

      const promptText = prompts[index];
      if (!promptText) continue;

      const imagePath = imagePrompts[index];

      try {
        await page.click(PROMPT_SELECTOR, { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.type(PROMPT_SELECTOR, promptText);

        if (imagePath) {
          const input = await page.$(FILE_INPUT_SELECTOR);
          if (input) {
            await input.uploadFile(imagePath);
          }
        }

        await page.click(SUBMIT_SELECTOR);
        await page.waitForTimeout(config.promptDelayMs);

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

    return { ok: true, submitted, failed };
  } catch (error) {
    return { ok: false, submitted, failed, error: (error as Error).message };
  } finally {
    cancellationMap.delete(session.id);
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        // ignore close errors
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
