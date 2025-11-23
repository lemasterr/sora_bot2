import fs from 'fs';
import path from 'path';

import { getConfig } from '../config/config';

const candidateChromePaths = (): string[] => {
  const candidates: string[] = [];

  if (process.env.CHROME_PATH) {
    candidates.push(process.env.CHROME_PATH);
  }

  const platform = process.platform;

  if (platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome'
    );
  } else if (platform === 'win32') {
    const programFiles = process.env['PROGRAMFILES'];
    const programFilesX86 = process.env['PROGRAMFILES(X86)'];
    const localAppData = process.env['LOCALAPPDATA'];

    if (programFiles) {
      candidates.push(path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    }
    if (programFilesX86) {
      candidates.push(path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    }
    if (localAppData) {
      candidates.push(path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    }
  } else {
    candidates.push(
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/snap/bin/chromium',
      '/opt/google/chrome/chrome'
    );
  }

  return candidates;
};

const pathExists = (target: string | null | undefined): target is string => {
  if (!target) return false;
  try {
    return fs.existsSync(target);
  } catch {
    return false;
  }
};

export async function resolveChromeExecutablePath(): Promise<string> {
  const config = await getConfig();
  const candidates: string[] = [];

  if (config.chromeExecutablePath) {
    candidates.push(config.chromeExecutablePath);
  }

  candidates.push(...candidateChromePaths());

  const found = candidates.find((entry) => pathExists(entry));
  if (found) {
    return found;
  }

  throw new Error('Chrome executable path is not configured. Please set it in Settings.');
}
