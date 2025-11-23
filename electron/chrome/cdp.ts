import puppeteer, { type Browser } from 'puppeteer-core';
import { getConfig } from '../config/config';
import { ChromeProfile } from './profiles';

export async function launchBrowserForSession(
  profile: ChromeProfile,
  cdpPort: number
): Promise<Browser> {
  const config = await getConfig();
  if (!config.chromeExecutablePath) {
    throw new Error('Chrome executable path is not configured');
  }

  return puppeteer.launch({
    executablePath: config.chromeExecutablePath,
    headless: false,
    userDataDir: profile.userDataDir,
    args: [
      `--profile-directory=${profile.profileDirectory ?? profile.profileDir ?? ''}`,
      `--remote-debugging-port=${cdpPort}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });
}
