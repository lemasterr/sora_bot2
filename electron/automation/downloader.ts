import fs from "fs/promises";
import path from "path";
import { Browser, Page } from "puppeteer-core";
import { launchBrowserForSession } from "../chrome/cdp";
import { ChromeProfile, getActiveChromeProfile, scanChromeProfiles } from "../chrome/profiles";
import { getConfig } from "../config/config";
import { getSessionPaths } from "../sessions/repo";
import { Session } from "../sessions/types";

export interface DownloadStats {
  ok: boolean;
  downloaded?: number;
  error?: string;
}

const CARD_SELECTOR = ".sora-draft-card";
const DOWNLOAD_BUTTON_SELECTOR = "button[data-testid='download']";

const cancellationMap = new Map<string, { cancelled: boolean }>();

const readLines = async (filePath: string): Promise<string[]> => {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return content.split(/\r?\n/);
  } catch (error: any) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
};

const ensureDir = async (dirPath: string): Promise<void> => {
  await fs.mkdir(dirPath, { recursive: true });
};

const configureDownloads = async (page: Page, downloadsDir: string): Promise<void> => {
  const client = await page.target().createCDPSession();
  await client.send("Page.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: downloadsDir,
  });
};

const safeFileName = (title: string): string => {
  const sanitized = title.replace(/[\\/:*?"<>|]/g, "_").trim() || "video";
  return sanitized.slice(0, 80);
};

const findLatestMp4 = async (dir: string): Promise<string | null> => {
  const entries = await fs.readdir(dir);
  const mp4Files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry);
      const stats = await fs.stat(fullPath);
      return { entry, fullPath, stats };
    }),
  );
  const filtered = mp4Files.filter((f) => f.stats.isFile() && f.entry.toLowerCase().endsWith(".mp4"));
  if (!filtered.length) return null;
  filtered.sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);
  return filtered[0].fullPath;
};

const waitForDownload = async (page: Page, timeoutMs: number): Promise<void> => {
  const client = await page.target().createCDPSession();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.removeListener("Page.downloadProgress", handler as any);
      reject(new Error("Download timeout"));
    }, timeoutMs);

    const handler = (event: any) => {
      if (event?.state === "completed") {
        clearTimeout(timer);
        client.removeListener("Page.downloadProgress", handler as any);
        resolve();
      }
    };

    client.on("Page.downloadProgress", handler as any);
  });
};

const resolveProfile = async (session: Session): Promise<ChromeProfile | null> => {
  if (session.chromeProfileName) {
    const profiles = await scanChromeProfiles();
    return profiles.find((p) => p.name === session.chromeProfileName) ?? null;
  }
  return getActiveChromeProfile();
};

const downloadDraftCard = async (
  page: Page,
  cardHandle: any,
  title: string,
  downloadsDir: string,
  timeoutMs: number,
): Promise<string | null> => {
  await cardHandle.click();

  const downloadButton = await page.waitForSelector(DOWNLOAD_BUTTON_SELECTOR, {
    timeout: timeoutMs,
  });
  if (!downloadButton) throw new Error("Download button not found");

  const downloadPromise = waitForDownload(page, timeoutMs);
  await downloadButton.click();
  await downloadPromise;

  const latestFile = await findLatestMp4(downloadsDir);
  if (!latestFile) return null;

  const targetPath = path.join(downloadsDir, `${safeFileName(title)}.mp4`);
  if (latestFile !== targetPath) {
    await fs.rename(latestFile, targetPath);
  }
  return targetPath;
};

export const openDrafts = async (session: Session): Promise<void> => {
  let browser: Browser | null = null;
  try {
    const profile = await resolveProfile(session);
    if (!profile) throw new Error("No Chrome profile available");
    const cdpPort = session.cdpPort ?? 9222;
    browser = await launchBrowserForSession(profile, cdpPort);
    const page = await browser.newPage();
    await page.goto("https://sora.chatgpt.com/drafts", { waitUntil: "networkidle2" });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (error) {
        // ignore
      }
    }
  }
};

export const scanDrafts = async (session: Session): Promise<number> => {
  let browser: Browser | null = null;
  try {
    const profile = await resolveProfile(session);
    if (!profile) throw new Error("No Chrome profile available");
    const cdpPort = session.cdpPort ?? 9222;
    browser = await launchBrowserForSession(profile, cdpPort);
    const page = await browser.newPage();
    await page.goto("https://sora.chatgpt.com/drafts", { waitUntil: "networkidle2" });
    await page.waitForSelector(CARD_SELECTOR, { timeout: 5000 }).catch(() => null);
    const cards = await page.$$(CARD_SELECTOR);
    return cards.length;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (error) {
        // ignore
      }
    }
  }
};

export const runDownloads = async (
  session: Session,
  maxVideos: number = Number.POSITIVE_INFINITY,
): Promise<DownloadStats> => {
  const cancelState = { cancelled: false };
  cancellationMap.set(session.id, cancelState);

  let browser: Browser | null = null;
  let downloaded = 0;

  try {
    const config = await getConfig();
    const profile = await resolveProfile(session);
    if (!profile) {
      return { ok: false, error: "No Chrome profile available" };
    }

    const cdpPort = session.cdpPort ?? 9222;
    browser = await launchBrowserForSession(profile, cdpPort);
    const page = await browser.newPage();

    const paths = await getSessionPaths(session);
    await ensureDir(paths.downloadDir);
    await configureDownloads(page, paths.downloadDir);

    await page.goto("https://sora.chatgpt.com/drafts", { waitUntil: "networkidle2" });
    await page.waitForSelector(CARD_SELECTOR, { timeout: config.downloadTimeoutMs }).catch(() => null);
    const cards = await page.$$(CARD_SELECTOR);

    const titles = await readLines(paths.titlesFile);
    const limit = Math.min(
      cards.length,
      titles.length,
      Number.isFinite(maxVideos) ? maxVideos : Number.POSITIVE_INFINITY,
    );

    for (let index = 0; index < limit; index += 1) {
      if (cancelState.cancelled) break;

      const card = cards[index];
      const title = titles[index]?.trim() || `video_${index + 1}`;

      try {
        await downloadDraftCard(
          page,
          card,
          title,
          paths.downloadDir,
          config.downloadTimeoutMs,
        );
        downloaded += 1;
      } catch (error) {
        // continue to next card on error
      }
    }

    return { ok: true, downloaded, error: undefined };
  } catch (error: any) {
    return { ok: false, downloaded, error: error?.message ?? String(error) };
  } finally {
    cancellationMap.delete(session.id);
    if (browser) {
      try {
        await browser.close();
      } catch (error) {
        // ignore
      }
    }
  }
};

export const cancelDownloads = async (sessionId: string): Promise<void> => {
  const entry = cancellationMap.get(sessionId);
  if (entry) {
    entry.cancelled = true;
  } else {
    cancellationMap.set(sessionId, { cancelled: true });
  }
};

