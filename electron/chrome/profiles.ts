import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { getConfig, updateConfig } from '../config/config';
import { logError, logInfo, logWarn } from '../logging/logger';

export type ChromeProfile = {
  name: string;
  userDataDir: string;
  profileDir: string;
  isActive?: boolean;
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

function getBaseCandidatePaths(configuredPath?: string | null): string[] {
  const home = os.homedir();
  const candidates = new Set<string>();

  if (configuredPath) {
    candidates.add(path.resolve(configuredPath));
  }

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    candidates.add(path.join(localAppData, 'Google', 'Chrome', 'User Data'));
  } else if (process.platform === 'darwin') {
    candidates.add(path.join(home, 'Library', 'Application Support', 'Google', 'Chrome'));
  } else {
    candidates.add(path.join(home, '.config', 'google-chrome'));
    candidates.add(path.join(home, '.config', 'chromium'));
  }

  return Array.from(candidates);
}

async function collectProfiles(basePath: string): Promise<ChromeProfile[]> {
  if (!(await dirExists(basePath))) return [];

  const entries = await fs.readdir(basePath, { withFileTypes: true });
  const allowedNames = ['Default', 'Guest Profile'];
  return entries
    .filter((entry) =>
      entry.isDirectory() && (allowedNames.includes(entry.name) || entry.name.startsWith('Profile '))
    )
    .map<ChromeProfile>((entry) => ({
      name: entry.name,
      userDataDir: basePath,
      profileDir: entry.name,
    }));
}

function annotateActive(profiles: ChromeProfile[], activeName?: string | null): ChromeProfile[] {
  return profiles.map((profile) => ({
    ...profile,
    isActive: activeName ? profile.name === activeName : false,
  }));
}

export async function scanChromeProfiles(): Promise<ChromeProfile[]> {
  const config = await getConfig();
  const bases = getBaseCandidatePaths(config.chromeUserDataDir);
  const results: ChromeProfile[] = [];
  let configuredPathError: Error | null = null;

  for (const base of bases) {
    try {
      const exists = await dirExists(base);
      if (!exists) {
        if (config.chromeUserDataDir && path.resolve(config.chromeUserDataDir) === path.resolve(base)) {
          configuredPathError = new Error(`Configured Chrome user data directory not found: ${base}`);
        }
        logWarn('chromeProfiles', `Chrome user data directory missing: ${base}`);
        continue;
      }

      logInfo('chromeProfiles', `Scanning Chrome profiles in ${base}`);
      const profiles = await collectProfiles(base);
      logInfo('chromeProfiles', `Found ${profiles.length} Chrome profiles in ${base}`);

      for (const profile of profiles) {
        const key = `${profile.userDataDir}::${profile.profileDir}`;
        const existing = results.find((p) => `${p.userDataDir}::${p.profileDir}` === key);
        if (!existing) {
          results.push(profile);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        logWarn('chromeProfiles', `Chrome user data directory not accessible: ${base}`);
        continue;
      }
      logError('chromeProfiles', `Failed to scan ${base}: ${(error as Error).message}`);
    }
  }

  if (results.length === 0 && configuredPathError) {
    throw configuredPathError;
  }

  cachedProfiles = results;
  const annotated = annotateActive(results, config.chromeActiveProfileName ?? undefined);
  logInfo('chromeProfiles', `Total Chrome profiles detected: ${annotated.length}`);
  return annotated;
}

export async function setActiveChromeProfile(name: string): Promise<void> {
  const profiles = cachedProfiles ?? (await scanChromeProfiles());
  const hasProfile = profiles.some((p) => p.name === name);
  if (!hasProfile) {
    throw new Error(`Profile "${name}" not found`);
  }

  await updateConfig({ chromeActiveProfileName: name });
  cachedProfiles = annotateActive(profiles, name);
  logInfo('chromeProfiles', `Active Chrome profile set to ${name}`);
}

export async function getActiveChromeProfile(): Promise<ChromeProfile | null> {
  const config = await getConfig();
  if (!cachedProfiles) {
    await scanChromeProfiles();
  }

  const profile = cachedProfiles?.find((p) => p.name === config.chromeActiveProfileName);
  return profile ?? null;
}

export async function listChromeProfiles(): Promise<ChromeProfile[]> {
  const config = await getConfig();
  if (!cachedProfiles) {
    await scanChromeProfiles();
  }

  return annotateActive(cachedProfiles ?? [], config.chromeActiveProfileName ?? undefined);
}

export function applyConfig(): void {
  // no-op placeholder retained for compatibility
}
