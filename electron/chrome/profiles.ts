import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { getConfig, updateConfig } from '../config/config';
import { logError, logInfo } from '../logging/logger';
import { ensureDir } from '../utils/fs';

export type ChromeProfile = {
  name: string;
  userDataDir: string;
  profileDirectory: string;
  profileDir?: string;
  isActive?: boolean;
};

export type SessionProfilePreference = {
  chromeProfileName?: string | null;
  userDataDir?: string | null;
  profileDirectory?: string | null;
};

let cachedProfiles: ChromeProfile[] | null = null;

function slugifyProfileName(name: string): string {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/gi, '');
  return normalized.length > 0 ? normalized : 'profile';
}

async function dirExists(candidate: string): Promise<boolean> {
  try {
    const stats = await fs.stat(candidate);
    return stats.isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return false;
    throw error;
  }
}

export function discoverChromeProfileRoots(): string[] {
  const home = os.homedir();
  const candidates: string[] = [];

  if (process.platform === 'darwin') {
    candidates.push(path.join(home, 'Library', 'Application Support', 'Google', 'Chrome'));
  } else if (process.platform.startsWith('win')) {
    const envVars = ['LOCALAPPDATA', 'APPDATA', 'USERPROFILE'] as const;
    for (const envVar of envVars) {
      const base = process.env[envVar];
      if (!base) continue;
      const candidate = path.join(base, 'Google', 'Chrome', 'User Data');
      if (!candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    }
  } else {
    candidates.push(path.join(home, '.config', 'google-chrome'));
    candidates.push(path.join(home, '.config', 'chromium'));
  }

  return candidates;
}

async function collectProfiles(basePath: string): Promise<ChromeProfile[]> {
  if (!(await dirExists(basePath))) return [];

  const entries = await fs.readdir(basePath, { withFileTypes: true });
  const allowedNames = ['Default', 'Guest Profile'];
  const results: ChromeProfile[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!(allowedNames.includes(entry.name) || entry.name.startsWith('Profile '))) continue;

    results.push({
      name: entry.name,
      userDataDir: basePath,
      profileDirectory: entry.name,
      profileDir: entry.name,
    });
  }

  return results;
}

function annotateActive(
  profiles: ChromeProfile[],
  activeName?: string | null,
  activeUserDataDir?: string | null
): ChromeProfile[] {
  return profiles.map((profile) => {
    const matchesName = activeName ? profile.name === activeName : false;
    const matchesDir = activeUserDataDir ? profile.userDataDir === activeUserDataDir : true;
    return {
      ...profile,
      isActive: matchesName && matchesDir,
    };
  });
}

/**
 * Resolve how we launch a Chrome profile for Puppeteer.
 *
 * Old behaviour (working in the previous build) pointed Puppeteer directly at the
 * profile directory (e.g. `${userDataDir}/Profile 1`) as the user-data-dir, which
 * avoids Chrome treating the default data dir as "unsafe" for remote debugging
 * and keeps existing Sora auth/session data intact. The newer build switched to
 * using the base userDataDir + `--profile-directory`, which triggered
 * `DevTools remote debugging requires a non-default data directory` and spun up
 * empty profiles for some users. The helper below restores the old launch path
 * while keeping the newer cached profile discovery intact.
 */
export async function resolveProfileLaunchTarget(
  profile: ChromeProfile
): Promise<{ userDataDir: string; profileDirectoryArg?: string }> {
  // Prefer launching directly against the profile directory (base + profile
  // folder) so Chrome reuses the full cache/cookies for the chosen profile.
  // If that directory does not exist for some reason, fall back to the base
  // userDataDir with a --profile-directory hint (keeps compatibility with the
  // cached discovery data).
  const profilePath = path.join(profile.userDataDir, profile.profileDirectory);

  try {
    const stats = await fs.stat(profilePath);
    if (stats.isDirectory()) {
      // When launching directly into an existing profile directory, Chrome
      // treats that folder as the user-data-dir, so we must not also pass
      // --profile-directory. Supplying both causes Chrome to ignore the
      // supplied data dir and boot a fresh profile, which prevents users from
      // reusing their already logged-in profiles.
      return { userDataDir: profilePath };
    }
  } catch {
    // ignore and fall back below
  }

  return { userDataDir: profile.userDataDir, profileDirectoryArg: profile.profileDirectory };
}

export async function scanChromeProfiles(): Promise<ChromeProfile[]> {
  const config = await getConfig();
  // Revert to the legacy discovery order: scan the OS default Chrome roots first
  // (these contain the real signed-in user profiles) and only then consider any
  // explicit chromeUserDataDir override as an *additional* base. Previously we
  // prioritized chromeUserDataDir ahead of the standard roots, which caused
  // Puppeteer to pick up empty/temporary profiles and lose Sora auth context.
  const bases = discoverChromeProfileRoots();
  const searchRoots = [...bases];

  if (config.chromeUserDataDir && !searchRoots.includes(config.chromeUserDataDir)) {
    searchRoots.push(config.chromeUserDataDir);
  }

  const results: ChromeProfile[] = [];

  for (const base of searchRoots) {
    try {
      const expanded = base.replace(/^~(\\|\/)/, `${os.homedir()}$1`);
      const profiles = await collectProfiles(expanded);
      logInfo('chromeProfiles', `Found ${profiles.length} Chrome profiles in ${expanded}`);
      for (const profile of profiles) {
        const key = `${profile.userDataDir}::${profile.profileDirectory}`;
        if (!results.find((p) => `${p.userDataDir}::${p.profileDirectory}` === key)) {
          results.push(profile);
        }
      }
    } catch (error) {
      logError('chromeProfiles', `Failed to scan ${base}: ${(error as Error).message}`);
    }
  }

  const annotated = annotateActive(
    results,
    config.chromeActiveProfileName ?? undefined,
    config.chromeUserDataDir ?? undefined
  );
  cachedProfiles = annotated;
  logInfo('chromeProfiles', `Total Chrome profiles detected: ${annotated.length}`);
  return annotated;
}

export async function setActiveChromeProfile(name: string): Promise<void> {
  const profiles = cachedProfiles ?? (await scanChromeProfiles());
  const match = profiles.find((p) => p.name === name);

  if (!match) {
    throw new Error(`Profile "${name}" not found`);
  }

  const config = await updateConfig({
    chromeActiveProfileName: name,
    // Persist the exact userDataDir for disambiguation when multiple profiles share the same
    // display name across different roots (e.g. cloned vs system Default). This mirrors the
    // legacy behaviour where the active profile selection always carried its base directory.
    chromeUserDataDir: match.userDataDir,
  });

  cachedProfiles = annotateActive(profiles, name, config.chromeUserDataDir ?? undefined);
  logInfo('chromeProfiles', `Active Chrome profile set to ${name} @ ${match.userDataDir}`);
}

export async function getActiveChromeProfile(): Promise<ChromeProfile | null> {
  const config = await getConfig();
  if (!cachedProfiles) {
    await scanChromeProfiles();
  }
  // Prefer an exact match on both name and userDataDir to avoid picking another root that
  // happens to contain the same profile name (e.g. cloned vs system). Fall back to name-only
  // if the configured userDataDir is absent.
  const profile = cachedProfiles?.find(
    (p) =>
      p.name === config.chromeActiveProfileName &&
      (config.chromeUserDataDir ? p.userDataDir === config.chromeUserDataDir : true)
  );

  if (profile) return profile;

  return cachedProfiles?.find((p) => p.name === config.chromeActiveProfileName) ?? null;
}

export async function resolveChromeProfileForSession(
  preference?: SessionProfilePreference
): Promise<ChromeProfile | null> {
  const [profiles, config] = await Promise.all([scanChromeProfiles(), getConfig()]);

  const desiredName = preference?.chromeProfileName ?? config.chromeActiveProfileName ?? null;
  const desiredUserDataDir = preference?.userDataDir ?? null;
  const desiredProfileDir = preference?.profileDirectory ?? null;

  const matchesPreference = (candidate: ChromeProfile, requireName: boolean): boolean => {
    const matchesName = desiredName ? candidate.name === desiredName : !requireName;
    const matchesUserData = desiredUserDataDir ? candidate.userDataDir === desiredUserDataDir : true;
    const candidateDir = candidate.profileDirectory ?? candidate.profileDir;
    const matchesProfileDir = desiredProfileDir ? candidateDir === desiredProfileDir : true;

    const respectsConfiguredRoot = config.chromeUserDataDir ? candidate.userDataDir === config.chromeUserDataDir : true;

    return matchesName && matchesUserData && matchesProfileDir && respectsConfiguredRoot;
  };

  const strictMatch = profiles.find((profile) => matchesPreference(profile, false));
  if (strictMatch) return strictMatch;

  if (desiredName) {
    const nameOnlyMatch = profiles.find((profile) => matchesPreference(profile, true));
    if (nameOnlyMatch) return nameOnlyMatch;
  }

  const active = await getActiveChromeProfile();
  if (active) return active;

  return profiles[0] ?? null;
}

export async function cloneActiveChromeProfile(): Promise<{ ok: boolean; profile?: ChromeProfile; message?: string; error?: string }> {
  try {
    const config = await getConfig();
    const profiles = cachedProfiles ?? (await scanChromeProfiles());
    const active = profiles.find((p) => p.isActive) ?? profiles.find((p) => p.name === config.chromeActiveProfileName);
    if (!active) {
      throw new Error('Active Chrome profile not found. Please select a profile before cloning.');
    }

    const cloneRoot = config.chromeClonedProfilesRoot || path.join(config.sessionsRoot, 'chrome-clones');
    await ensureDir(cloneRoot);

    const slug = slugifyProfileName(`${active.profileDirectory || active.name}-sora-clone`);
    const targetUserDataDir = path.join(cloneRoot, slug);
    const sourceUserDataDir = active.userDataDir;

    if (sourceUserDataDir === targetUserDataDir) {
      // Already pointing at a cloned directory; just refresh cache.
      const refreshedConfig = await updateConfig({
        chromeUserDataDir: targetUserDataDir,
        chromeActiveProfileName: active.name,
        chromeClonedProfilesRoot: cloneRoot,
      });
      const refreshed = await scanChromeProfiles();
      const profile = refreshed.find((p) => p.userDataDir === targetUserDataDir && p.name === refreshedConfig.chromeActiveProfileName);
      return { ok: true, profile: profile ?? active, message: 'Using existing cloned profile' };
    }

    const targetExists = await dirExists(targetUserDataDir);
    if (!targetExists) {
      logInfo('chromeProfiles', `Cloning Chrome profile from ${sourceUserDataDir} to ${targetUserDataDir}`);
      await fs.cp(sourceUserDataDir, targetUserDataDir, { recursive: true });
    } else {
      logInfo('chromeProfiles', `Reusing existing cloned profile at ${targetUserDataDir}`);
    }

    const updatedConfig = await updateConfig({
      chromeUserDataDir: targetUserDataDir,
      chromeActiveProfileName: active.profileDirectory,
      chromeClonedProfilesRoot: cloneRoot,
    });

    const refreshed = await scanChromeProfiles();
    const profile = refreshed.find(
      (p) => p.userDataDir === targetUserDataDir && p.profileDirectory === updatedConfig.chromeActiveProfileName
    );

    return { ok: true, profile: profile ?? active, message: targetExists ? 'Cloned profile reused' : 'Profile cloned for Sora' };
  } catch (error) {
    const message = (error as Error)?.message ?? 'Failed to clone Chrome profile';
    logError('chromeProfiles', message);
    return { ok: false, error: message };
  }
}

export async function listChromeProfiles(): Promise<ChromeProfile[]> {
  const config = await getConfig();
  if (!cachedProfiles) {
    await scanChromeProfiles();
  }

  return annotateActive(
    cachedProfiles ?? [],
    config.chromeActiveProfileName ?? undefined,
    config.chromeUserDataDir ?? undefined
  );
}

export function applyConfig(): void {
  // no-op placeholder retained for compatibility
}
