import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { getConfig, updateConfig } from '../config/config';

export type ChromeProfile = {
  name: string;
  userDataDir: string;
  profileDir: string;
};

let cachedProfiles: ChromeProfile[] | null = null;

async function dirExists(candidate: string): Promise<boolean> {
  try {
    const stats = await fs.stat(candidate);
    return stats.isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return false;
    throw error;
  }
}

function getBaseCandidatePaths(): string[] {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    return [path.join(localAppData, 'Google', 'Chrome', 'User Data')];
  }

  if (process.platform === 'darwin') {
    return [path.join(home, 'Library', 'Application Support', 'Google', 'Chrome')];
  }

  // linux and others
  return [path.join(home, '.config', 'google-chrome')];
}

async function collectProfiles(basePath: string): Promise<ChromeProfile[]> {
  if (!(await dirExists(basePath))) return [];

  const entries = await fs.readdir(basePath, { withFileTypes: true });
  return entries
    .filter((entry) =>
      entry.isDirectory() && (entry.name === 'Default' || entry.name.startsWith('Profile '))
    )
    .map<ChromeProfile>((entry) => ({
      name: entry.name,
      userDataDir: basePath,
      profileDir: entry.name,
    }));
}

export async function scanChromeProfiles(): Promise<ChromeProfile[]> {
  const bases = getBaseCandidatePaths();
  const results: ChromeProfile[] = [];

  for (const base of bases) {
    const profiles = await collectProfiles(base);
    results.push(...profiles);
  }

  cachedProfiles = results;
  return results;
}

export async function setActiveChromeProfile(name: string): Promise<void> {
  await updateConfig({ chromeActiveProfileName: name });
}

export async function getActiveChromeProfile(): Promise<ChromeProfile | null> {
  const config = await getConfig();
  if (!cachedProfiles) {
    await scanChromeProfiles();
  }

  const profile = cachedProfiles?.find((p) => p.name === config.chromeActiveProfileName);
  return profile ?? null;
}

export function applyConfig(): void {
  // no-op placeholder retained for compatibility
}
