import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';
import puppeteer, { type Browser } from 'puppeteer-core';

import { getConfig } from '../config/config';
import { resolveChromeExecutablePath } from './paths';
import { ChromeProfile, resolveProfileLaunchTarget } from './profiles';

const CDP_HOST = '127.0.0.1';

type ChromeInstance = {
  key: string;
  port: number;
  endpoint: string;
  browser: Browser;
  profileDirectory: string;
  userDataDir: string;
  spawned: boolean;
  childPid?: number;
};

const activeInstances = new Map<string, ChromeInstance>();

async function terminateSpawnedProcess(pid?: number): Promise<void> {
  if (!pid) return;

  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      const killer = spawn('taskkill', ['/PID', `${pid}`, '/T', '/F'], { stdio: 'ignore' });
      killer.on('exit', () => resolve());
      killer.on('error', () => resolve());
    });
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // ignore
  }

  await delay(500);

  try {
    process.kill(pid, 0);
    process.kill(pid, 'SIGKILL');
  } catch {
    // ignore if already exited
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isEndpointAvailable(endpoint: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(endpoint, { timeout: 1000 }, (res) => {
      res.destroy();
      resolve(true);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForEndpoint(endpoint: string, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isEndpointAvailable(endpoint)) return;
    await delay(250);
  }
  throw new Error(`Chrome CDP endpoint did not open at ${endpoint}`);
}

type LaunchInfo = { endpoint: string; alreadyRunning: boolean; childPid?: number };

async function ensureChromeWithCDP(profile: ChromeProfile, port: number): Promise<LaunchInfo> {
  const config = await getConfig();
  const executablePath = await resolveChromeExecutablePath().catch((error) => {
    if (config.chromeExecutablePath) return config.chromeExecutablePath;
    throw error;
  });

  const endpoint = `http://${CDP_HOST}:${port}`;
  if (await isEndpointAvailable(endpoint)) {
    return { endpoint, alreadyRunning: true };
  }

  const { userDataDir, profileDirectoryArg } = await resolveProfileLaunchTarget(profile);

  if (!fs.existsSync(userDataDir)) {
    throw new Error(`Chrome profile directory not found at ${userDataDir}. Please re-select the profile in Settings.`);
  }

  if (profileDirectoryArg) {
    const profileDirPath = path.join(userDataDir, profileDirectoryArg);
    if (!fs.existsSync(profileDirPath)) {
      throw new Error(`Chrome profile "${profileDirectoryArg}" is missing under ${userDataDir}. Choose another profile.`);
    }
  }
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    ...(profileDirectoryArg ? [`--profile-directory=${profileDirectoryArg}`] : []),
    '--disable-features=AutomationControlled',
    '--no-first-run',
    '--no-default-browser-check',
    '--start-maximized',
  ];

  const child = spawn(executablePath, args, {
    detached: true,
    stdio: 'ignore',
  });

  child.unref();

  await waitForEndpoint(endpoint);

  console.info('[chrome] spawned browser for CDP', {
    executablePath,
    userDataDir,
    profileDirectory: profileDirectoryArg,
    cdpPort: port,
  });

  return { endpoint, alreadyRunning: false, childPid: child.pid };
}

function instanceKey(profile: ChromeProfile): string {
  const name = profile.profileDirectory ?? profile.name ?? 'profile';
  const base = profile.userDataDir ?? 'user-data';
  const dir = profile.profileDirectory ?? profile.profileDir ?? 'Default';
  return `${base}::${dir}::${name}`;
}

export async function getOrLaunchChromeForProfile(profile: ChromeProfile, port: number): Promise<Browser> {
  const key = instanceKey(profile);
  const existing = activeInstances.get(key);

  if (existing && existing.browser.isConnected()) {
    return existing.browser;
  }

  if (existing) {
    activeInstances.delete(key);
  }

  const { endpoint, alreadyRunning, childPid } = await ensureChromeWithCDP(profile, port);
  const browser = (await puppeteer.connect({
    browserURL: endpoint,
    defaultViewport: null,
  })) as Browser & { __soraAlreadyRunning?: boolean; __soraManaged?: boolean };

  browser.__soraAlreadyRunning = alreadyRunning;
  browser.__soraManaged = !alreadyRunning;

  activeInstances.set(key, {
    key,
    browser,
    endpoint,
    port,
    userDataDir: profile.userDataDir,
    profileDirectory: profile.profileDirectory ?? profile.profileDir ?? 'Default',
    spawned: !alreadyRunning,
    childPid,
  });

  browser.on('disconnected', () => {
    const current = activeInstances.get(key);
    if (current && current.browser === browser) {
      activeInstances.delete(key);
    }
  });

  console.info('[chrome] connected to CDP', {
    endpoint,
    userDataDir: profile.userDataDir,
    profileDirectory: profile.profileDirectory ?? profile.profileDir ?? 'Default',
  });

  return browser;
}

export async function shutdownChromeByKey(key: string): Promise<void> {
  const existing = activeInstances.get(key);

  if (!existing) return;

  activeInstances.delete(key);

  try {
    await existing.browser.close();
  } catch {
    // ignore close errors
  }

  if (existing.spawned && existing.childPid) {
    await terminateSpawnedProcess(existing.childPid);
  }
}

export async function shutdownChromeForProfile(profile: ChromeProfile): Promise<void> {
  await shutdownChromeByKey(instanceKey(profile));
}

export function closeChromeForProfile(profile: ChromeProfile): void {
  shutdownChromeForProfile(profile).catch(() => undefined);
}

export async function shutdownAllChrome(): Promise<void> {
  const keys = Array.from(activeInstances.keys());
  for (const key of keys) {
    try {
      await shutdownChromeByKey(key);
    } catch {
      // ignore shutdown errors
    }
  }
}

