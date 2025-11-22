import puppeteer, { Browser, Page } from 'puppeteer-core';
import type { Config } from '../../shared/types';

export type SessionRunContext = {
  sessionName: string;
  sessionPath: string;
  profileDir: string;
  downloadsDir: string;
  config: Config;
  cancelled: boolean;
};

let chromeExecutablePath = '';

export const setChromeExecutablePath = (executablePath: string) => {
  chromeExecutablePath = executablePath;
};

export const launchBrowser = async (ctx: SessionRunContext): Promise<{ browser: Browser }> => {
  if (!chromeExecutablePath) {
    throw new Error('Chrome executable path is not configured');
  }

  const browser = await puppeteer.launch({
    executablePath: chromeExecutablePath,
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
