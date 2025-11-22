import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { loadConfig, saveConfig } from './config';
import type { ChromeProfile, Config } from '../shared/types';

const chromeDirCandidates = (): string[] => {
  const home = os.homedir();
  const candidates: string[] = [];

  if (process.platform === 'darwin') {
    candidates.push(path.join(home, 'Library', 'Application Support', 'Google', 'Chrome'));
  } else if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    candidates.push(path.join(localAppData, 'Google', 'Chrome', 'User Data'));
  } else {
    candidates.push(path.join(home, '.config', 'google-chrome'));
    candidates.push(path.join(home, '.config', 'chromium'));
  }

  return candidates;
};

const isDirectory = async (p: string): Promise<boolean> => {
  try {
    const stat = await fs.stat(p);
    return stat.isDirectory();
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return false;
    throw error;
  }
};

const listProfileDirs = async (userDataDir: string): Promise<ChromeProfile[]> => {
  if (!(await isDirectory(userDataDir))) return [];

  const entries = await fs.readdir(userDataDir, { withFileTypes: true });
  const profiles: ChromeProfile[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    if (name === 'Default' || name.startsWith('Profile ')) {
      profiles.push({
        name,
        userDataDir,
        profileDirectory: name,
        profileDir: path.join(userDataDir, name)
      });
    }
  }

  return profiles;
};

export const scanChromeProfiles = async (): Promise<ChromeProfile[]> => {
  const found: ChromeProfile[] = [];
  for (const dir of chromeDirCandidates()) {
    const profiles = await listProfileDirs(dir);
    for (const profile of profiles) {
      if (!found.some((p) => (p.profileDir ?? p.profileDirectory) === (profile.profileDir ?? profile.profileDirectory))) {
        found.push(profile);
      }
    }
  }
  return found;
};

const mapWithActive = (profiles: ChromeProfile[], config: Config): ChromeProfile[] => {
  const activeName = config.activeChromeProfile;
  return profiles.map((profile) => ({
    ...profile,
    isActive: activeName ? profile.name === activeName : false
  }));
};

export const scanAndStoreChromeProfiles = async (): Promise<ChromeProfile[]> => {
  const config = await loadConfig();
  const profiles = await scanChromeProfiles();
  await saveConfig({
    chromeProfiles: profiles,
    activeChromeProfile: config.activeChromeProfile
  });
  const refreshed = await loadConfig();
  return mapWithActive(profiles, refreshed);
};

export const saveChromeProfile = async (profile: ChromeProfile): Promise<ChromeProfile[]> => {
  const config = await loadConfig();
  const existing = config.chromeProfiles ?? [];
  const filtered = existing.filter((p) => p.name !== profile.name);
  const updated = [...filtered, { ...profile }];
  await saveConfig({ chromeProfiles: updated });
  const refreshed = await loadConfig();
  return mapWithActive(updated, refreshed);
};

export const removeChromeProfile = async (name: string): Promise<ChromeProfile[]> => {
  const config = await loadConfig();
  const existing = config.chromeProfiles ?? [];
  const updated = existing.filter((p) => p.name !== name);
  const nextActive = config.activeChromeProfile === name ? undefined : config.activeChromeProfile;
  await saveConfig({ chromeProfiles: updated, activeChromeProfile: nextActive });
  const refreshed = await loadConfig();
  return mapWithActive(updated, refreshed);
};

export const setActiveChromeProfile = async (name: string): Promise<ChromeProfile[]> => {
  const config = await loadConfig();
  const existing = config.chromeProfiles ?? [];
  const hasProfile = existing.some((p) => p.name === name);
  if (!hasProfile) {
    throw new Error(`Profile "${name}" not found`);
  }
  await saveConfig({ activeChromeProfile: name });
  const refreshed = await loadConfig();
  return mapWithActive(existing, refreshed);
};

export const listChromeProfiles = async (): Promise<ChromeProfile[]> => {
  const config = await loadConfig();
  const profiles = config.chromeProfiles ?? [];
  return mapWithActive(profiles, config);
};
