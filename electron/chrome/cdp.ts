import puppeteer, { type Browser } from 'puppeteer-core';

import { getConfig } from '../config/config';
import { resolveChromeExecutablePath } from './paths';
import { ChromeProfile } from './profiles';

export async function launchBrowserForSession(
  profile: ChromeProfile,
  cdpPort: number
): Promise<Browser> {
  const config = await getConfig();
  const executablePath = await resolveChromeExecutablePath().catch((error) => {
    // fallback to configured path if resolution failed but a path exists
    if (config.chromeExecutablePath) {
      return config.chromeExecutablePath;
    }
    throw error;
  });

  return puppeteer.launch({
    executablePath,
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
