import puppeteer, { type Browser } from 'puppeteer-core';

import { getConfig } from '../config/config';
import { resolveChromeExecutablePath } from './paths';
import { ChromeProfile, resolveProfileLaunchTarget } from './profiles';

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

  const { userDataDir, profileDirectoryArg } = await resolveProfileLaunchTarget(profile);
  const args = [
    `--remote-debugging-port=${cdpPort}`,
    '--no-sandbox',
    '--disable-setuid-sandbox',
  ];

  if (profileDirectoryArg) {
    // Preserve the newer hinting approach when we fall back to the base userDataDir.
    args.unshift(`--profile-directory=${profileDirectoryArg}`);
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: false,
    // Use the profile folder itself when available to mirror the previous behaviour that
    // retained Sora auth, but still honour the cached discovery data.
    userDataDir,
    args,
  });

  // Log the actual launch target for diagnostics (helps compare with the prior build).
  console.info('[chrome] launch', {
    executablePath,
    userDataDir,
    profileDirectory: profileDirectoryArg ?? profile.profileDirectory,
    cdpPort,
  });

  return browser;
}
