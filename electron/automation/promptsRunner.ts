import fs from "fs/promises";
import path from "path";
import { Browser } from "puppeteer-core";
import { launchBrowserForSession } from "../chrome/cdp";
import {
  ChromeProfile,
  getActiveChromeProfile,
  scanChromeProfiles,
} from "../chrome/profiles";
import { getConfig } from "../config/config";
import { getSessionPaths } from "../sessions/repo";
import { Session } from "../sessions/types";

export interface PromptRunResult {
  ok: boolean;
  submitted?: number;
  failed?: number;
  error?: string;
}

const PROMPT_SELECTOR = "textarea[data-testid='prompt-input']";
const SUBMIT_SELECTOR = "button[data-testid='submit']";
const FILE_INPUT_SELECTOR = "input[type='file']";

const cancellationMap = new Map<string, { cancelled: boolean }>();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const appendLine = async (filePath: string, line: string): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${line}\n`, "utf-8");
};

const resolveProfile = async (
  session: Session,
): Promise<ChromeProfile | null> => {
  if (session.chromeProfileName) {
    const profiles = await scanChromeProfiles();
    return profiles.find((p) => p.name === session.chromeProfileName) ?? null;
  }
  return getActiveChromeProfile();
};

const readLines = async (filePath: string): Promise<string[]> => {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return content.split(/\r?\n/);
  } catch (error: any) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
};

export const runPrompts = async (session: Session): Promise<PromptRunResult> => {
  const cancelState = { cancelled: false };
  cancellationMap.set(session.id, cancelState);

  let browser: Browser | null = null;

  try {
    const config = await getConfig();
    const profile = await resolveProfile(session);
    if (!profile) {
      return { ok: false, error: "No Chrome profile available" };
    }

    const cdpPort = session.cdpPort ?? 9222;
    browser = await launchBrowserForSession(profile, cdpPort);
    const page = await browser.newPage();
    await page.goto("https://sora.chatgpt.com", { waitUntil: "networkidle2" });

    const paths = await getSessionPaths(session);
    const prompts = await readLines(paths.promptsFile);
    const images = await readLines(paths.imagePromptsFile);

    let submitted = 0;
    let failed = 0;

    await page.waitForSelector(PROMPT_SELECTOR, {
      timeout: config.draftTimeoutMs,
    });

    for (let index = 0; index < prompts.length; index += 1) {
      if (cancelState.cancelled) break;

      const promptText = prompts[index]?.trim();
      if (!promptText) continue;

      const imagePath = images[index]?.trim();

      try {
        const promptHandle = await page.waitForSelector(PROMPT_SELECTOR, {
          timeout: config.draftTimeoutMs,
        });
        if (!promptHandle) throw new Error("Prompt input not found");

        await promptHandle.click({ clickCount: 3 });
        await page.keyboard.press("Backspace");
        await promptHandle.type(promptText);

        if (imagePath) {
          const fileInput = await page.$(FILE_INPUT_SELECTOR);
          if (fileInput) {
            await fileInput.uploadFile(imagePath);
          }
        }

        const submitHandle = await page.waitForSelector(SUBMIT_SELECTOR, {
          timeout: config.draftTimeoutMs,
        });
        if (!submitHandle) throw new Error("Submit button not found");

        await submitHandle.click();
        await wait(config.promptDelayMs);

        submitted += 1;
        await appendLine(
          paths.submittedLog,
          `${new Date().toISOString()} | prompt #${index} OK | ${promptText.slice(
            0,
            80,
          )}`,
        );
      } catch (error: any) {
        failed += 1;
        await appendLine(
          paths.failedLog,
          `${new Date().toISOString()} | prompt #${index} FAILED | ${promptText?.slice(
            0,
            80,
          )} | ${error?.message ?? error}`,
        );
      }
    }

    return { ok: true, submitted, failed };
  } catch (error: any) {
    return { ok: false, error: error?.message ?? String(error) };
  } finally {
    cancellationMap.delete(session.id);
    if (browser) {
      try {
        await browser.close();
      } catch (error) {
        // ignore close errors
      }
    }
  }
};

export const cancelPrompts = async (sessionId: string): Promise<void> => {
  const entry = cancellationMap.get(sessionId);
  if (entry) {
    entry.cancelled = true;
  } else {
    cancellationMap.set(sessionId, { cancelled: true });
  }
};
