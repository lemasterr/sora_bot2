import fs from "fs/promises";
import os from "os";
import path from "path";
import { getConfig, updateConfig } from "../config/config";

export type ChromeProfile = {
  name: string;
  userDataDir: string;
  profileDir: string;
};

let cachedProfiles: ChromeProfile[] | null = null;

const getBaseUserDataDirs = (): string[] => {
  const home = os.homedir();
  const platform = process.platform;

  if (platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    return localAppData
      ? [path.join(localAppData, "Google", "Chrome", "User Data")]
      : [];
  }

  if (platform === "darwin") {
    return [path.join(home, "Library", "Application Support", "Google", "Chrome")];
  }

  return [path.join(home, ".config", "google-chrome")];
};

const isProfileDir = (dirName: string): boolean =>
  dirName === "Default" || /^Profile \d+$/i.test(dirName);

export const scanChromeProfiles = async (): Promise<ChromeProfile[]> => {
  const results: ChromeProfile[] = [];
  const baseDirs = getBaseUserDataDirs();

  for (const base of baseDirs) {
    try {
      const entries = await fs.readdir(base, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && isProfileDir(entry.name)) {
          results.push({
            name: entry.name,
            userDataDir: base,
            profileDir: entry.name,
          });
        }
      }
    } catch (error: any) {
      if (error?.code !== "ENOENT") {
        // Ignore missing base directories; rethrow other errors
        throw error;
      }
    }
  }

  cachedProfiles = results;
  return results;
};

export const setActiveChromeProfile = async (name: string): Promise<void> => {
  await updateConfig({ chromeActiveProfileName: name });
};

export const getActiveChromeProfile = async (): Promise<ChromeProfile | null> => {
  const config = await getConfig();
  if (!config.chromeActiveProfileName) return null;

  if (!cachedProfiles) {
    await scanChromeProfiles();
  }

  return (
    cachedProfiles?.find((p) => p.name === config.chromeActiveProfileName) ?? null
  );
};

export const listCachedProfiles = async (): Promise<ChromeProfile[]> => {
  if (!cachedProfiles) {
    await scanChromeProfiles();
  }
  return cachedProfiles ?? [];
};
