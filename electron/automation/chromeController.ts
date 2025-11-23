import puppeteer, { Browser, Page } from 'puppeteer-core';

import type { Config } from '../../shared/types';
import { resolveChromeExecutablePath } from '../chrome/paths';

export type SessionRunContext = {
  sessionName: string;
  sessionPath: string;
  profileDir: string;
  downloadsDir: string;
  config: Config;
  cancelled: boolean;
};

let chromeExecutablePath: string | null = null;

export const setChromeExecutablePath = (executablePath: string) => {
  chromeExecutablePath = executablePath;
};

export const launchBrowser = async (ctx: SessionRunContext): Promise<{ browser: Browser }> => {
  const executablePath = chromeExecutablePath ?? (await resolveChromeExecutablePath());

  const browser = await puppeteer.launch({
    executablePath,
    headless: false,
    userDataDir: ctx.profileDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  return { browser };
};

export const newPage = async (browser: Browser): Promise<Page> => {
  return browser.newPage();
};

export const configureDownloads = async (page: Page, downloadsDir: string): Promise<void> => {
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadsDir
  });
};
