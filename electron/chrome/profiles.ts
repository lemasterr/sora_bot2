import fs from 'fs/promises';
import fsSync from 'fs';
import os from 'os';
import path from 'path';
import { getConfig, updateConfig } from '../config/config';
import { logError, logInfo } from '../logging/logger';
import { ensureDir } from '../utils/fs';
import { findSystemChromeExecutable } from './paths';

export type ChromeProfile = {
  id: string;
  name: string;
  userDataDir: string;
  profileDirectory: string;
  profileDir?: string;
  isDefault?: boolean;
  lastUsed?: string;
  isActive?: boolean;
};

export interface ChromeProfileInfo {
  id: string;
  name: string;
  isDefault: boolean;
  lastUsed?: string;
}

export type SessionProfilePreference = {
  chromeProfileName?: string | null;
  userDataDir?: string | null;
  profileDirectory?: string | null;
};

let cachedProfiles: ChromeProfile[] | null = null;

export function getChromeUserDataRoot(): string | null {
  const home = os.homedir();
  const exists = (candidate: string | null): candidate is string => {
    if (!candidate) return false;
    try {
      return require('fs').existsSync(candidate);
    } catch {
      return false;
    }
  };

  if (process.platform === 'darwin') {
    const target = path.join(home, 'Library', 'Application Support', 'Google', 'Chrome');
    return exists(target) ? target : null;
  }

  if (process.platform.startsWith('win')) {
    const base = process.env.LOCALAPPDATA || process.env.APPDATA || process.env.USERPROFILE;
    const target = base ? path.join(base, 'Google', 'Chrome', 'User Data') : null;
    return exists(target) ? target : null;
  }

  const candidates = [path.join(home, '.config', 'google-chrome'), path.join(home, '.config', 'chromium')];
  for (const candidate of candidates) {
    if (exists(candidate)) return candidate;
  }

  return null;
}

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

export function readChromeProfiles(root: string): ChromeProfile[] {
  const localStatePath = path.join(root, 'Local State');
  const profiles: ChromeProfile[] = [];

  try {
    const raw = require('fs').readFileSync(localStatePath, 'utf-8');
    const parsed = JSON.parse(raw);
    const infoCache = parsed?.profile?.info_cache ?? {};

    for (const [id, info] of Object.entries<any>(infoCache)) {
      const displayName = info?.name || info?.gaia_name || id;
      const isDefault = id === 'Default' || info?.is_default === true;
      const lastUsed = info?.last_used as string | undefined;

      profiles.push({
        id,
        name: displayName,
        userDataDir: root,
        profileDirectory: id,
        profileDir: id,
        isDefault,
        lastUsed,
      });
    }
  } catch (error) {
    logError('chromeProfiles', `Failed to read Local State from ${localStatePath}: ${(error as Error).message}`);
    return [];
  }

  profiles.sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (b.isDefault && !a.isDefault) return 1;
    if (a.lastUsed && b.lastUsed && a.lastUsed !== b.lastUsed) return a.lastUsed > b.lastUsed ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return profiles;
}

function annotateActive(
  profiles: ChromeProfile[],
  activeId?: string | null,
  activeUserDataDir?: string | null
): ChromeProfile[] {
  return profiles.map((profile) => {
    const matchesName = activeId ? profile.profileDirectory === activeId || profile.id === activeId : false;
    const matchesDir = activeUserDataDir ? profile.userDataDir === activeUserDataDir : true;
    return {
      ...profile,
      isActive: matchesName && matchesDir,
    };
  });
}

export async function resolveProfileLaunchTarget(
  profile: ChromeProfile
): Promise<{ userDataDir: string; profileDirectoryArg?: string }> {
  /**
   * Sora 9–style behavior:
   * We NEVER launch Chrome directly against the system user-data root like:
   *   ~/Library/Application Support/Google/Chrome
   *
   * Instead, we always use a dedicated "automation" clone directory under
   *   config.chromeClonedProfilesRoot (default: <sessionsRoot>/chrome-clones)
   * so that:
   *   - normal Chrome can stay open on the main profile,
   *   - automation Chrome instances are fully sandboxed,
   *   - each selected profile gets its own stable clone dir.
   *
   * The "profile" argument still comes from scanChromeProfiles(), which reads
   * the real profiles, but the launched Chrome will use our cloned dir.
   */

  const config = await getConfig();
  const cloneRoot =
    config.chromeClonedProfilesRoot || path.join(config.sessionsRoot, 'chrome-clones');

  // Ensure root exists
  await ensureDir(cloneRoot);

  // Build a stable slug for this profile's automation clone
  const baseName = profile.profileDirectory || profile.name || profile.id;
  const slug = slugifyProfileName(`${baseName}-sora-clone`);

  // Final cloned user-data dir for automation
  const userDataDir = path.join(cloneRoot, slug);

  // Ensure the cloned profile directory exists before launching Chrome so we
  // never fail with "profile directory not found" on first use.
  await ensureDir(userDataDir);

  // We intentionally DO NOT pass --profile-directory here.
  // Chrome will treat this userDataDir as an independent profile root.
  // All cookies/extensions/logins for Sora will live under this clone dir.
  return { userDataDir, profileDirectoryArg: undefined };
}

export async function scanChromeProfiles(): Promise<ChromeProfile[]> {
  const config = await getConfig();

  const chromeBinary = await findSystemChromeExecutable();
  if (!chromeBinary) {
    logError('chromeProfiles', 'Chrome executable not found. Install Chrome or set the path in Settings.');
  }

  const roots: string[] = [];
  if (config.chromeUserDataRoot) roots.push(config.chromeUserDataRoot);
  else if (config.chromeUserDataDir) roots.push(config.chromeUserDataDir);

  const systemRoot = getChromeUserDataRoot();
  if (systemRoot && !roots.includes(systemRoot)) roots.push(systemRoot);

  const uniqueRoots = roots.filter(Boolean);
  if (uniqueRoots.length === 0) {
    logError('chromeProfiles', 'Chrome user-data root not found. Please configure it in Settings.');
    cachedProfiles = [];
    return [];
  }

  const profiles: ChromeProfile[] = [];

  for (const root of uniqueRoots) {
    const exists = await dirExists(root);
    if (!exists) continue;
    const found = readChromeProfiles(root);
    logInfo('chromeProfiles', `Found ${found.length} profiles under ${root}`);
    profiles.push(...found.filter((p) => !profiles.find((q) => q.id === p.id && q.userDataDir === p.userDataDir)));
  }

  const annotated = annotateActive(
    profiles,
    config.chromeProfileId ?? config.chromeActiveProfileName ?? undefined,
    config.chromeUserDataRoot ?? config.chromeUserDataDir ?? undefined
  );
  cachedProfiles = annotated;
  return annotated;
}

export async function setActiveChromeProfile(name: string): Promise<void> {
  const profiles = cachedProfiles ?? (await scanChromeProfiles());
  const match = profiles.find((p) => p.name === name || p.profileDirectory === name || p.id === name);

  if (!match) {
    throw new Error(`Profile "${name}" not found`);
  }

  const config = await updateConfig({
    chromeActiveProfileName: match.name,
    chromeProfileId: match.profileDirectory,
    chromeUserDataRoot: match.userDataDir,
    chromeUserDataDir: match.userDataDir,
  });

  cachedProfiles = annotateActive(profiles, match.profileDirectory, config.chromeUserDataDir ?? undefined);
  logInfo('chromeProfiles', `Active Chrome profile set to ${match.name} @ ${match.userDataDir}`);
}

export async function getActiveChromeProfile(): Promise<ChromeProfile | null> {
  const config = await getConfig();
  if (!cachedProfiles) {
    await scanChromeProfiles();
  }
  const desiredId = config.chromeProfileId ?? config.chromeActiveProfileName;
  const desiredRoot = config.chromeUserDataRoot ?? config.chromeUserDataDir;

  const profile = cachedProfiles?.find(
    (p) =>
      (p.profileDirectory === desiredId || p.id === desiredId || p.name === desiredId) &&
      (desiredRoot ? p.userDataDir === desiredRoot : true)
  );

  if (profile) return profile;

  return cachedProfiles?.find((p) => p.profileDirectory === desiredId || p.name === desiredId) ?? null;
}

export async function resolveChromeProfileForSession(
  preference?: SessionProfilePreference
): Promise<ChromeProfile | null> {
  const [profiles, config] = await Promise.all([scanChromeProfiles(), getConfig()]);

  const desiredName = preference?.chromeProfileName ?? config.chromeProfileId ?? config.chromeActiveProfileName ?? null;
  const desiredUserDataDir = preference?.userDataDir ?? config.chromeUserDataRoot ?? null;
  const desiredProfileDir = preference?.profileDirectory ?? null;

  const matchesPreference = (candidate: ChromeProfile, requireName: boolean): boolean => {
    const matchesName = desiredName
      ? candidate.name === desiredName || candidate.profileDirectory === desiredName || candidate.id === desiredName
      : !requireName;
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
