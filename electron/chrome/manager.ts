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

function isProfileDirInUse(userDataDir: string): boolean {
  const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
  return lockFiles.some((file) => fs.existsSync(path.join(userDataDir, file)));
}

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

async function readDevToolsActivePort(userDataDir: string): Promise<number | null> {
  const activePortFile = path.join(userDataDir, 'DevToolsActivePort');
  try {
    const content = await fs.promises.readFile(activePortFile, 'utf8');
    const port = Number(content.trim().split(/\s+/)[0]);
    return Number.isFinite(port) ? port : null;
  } catch {
    return null;
  }
}

async function ensureChromeWithCDP(profile: ChromeProfile, port: number): Promise<LaunchInfo> {
  const endpoint = `http://${CDP_HOST}:${port}`;
  if (await isEndpointAvailable(endpoint)) {
    return { endpoint, alreadyRunning: true };
  }

  const config = await getConfig();
  const executablePath = await resolveChromeExecutablePath().catch((error) => {
    if (config.chromeExecutablePath) return config.chromeExecutablePath;
    throw error;
  });

  const { userDataDir, profileDirectoryArg } = await resolveProfileLaunchTarget(profile);

  const activePort = await readDevToolsActivePort(userDataDir);
  if (activePort) {
    const activeEndpoint = `http://${CDP_HOST}:${activePort}`;
    if (await isEndpointAvailable(activeEndpoint)) {
      console.info('[chrome] detected existing DevTools port for profile', {
        activeEndpoint,
        requestedPort: port,
      });
      return { endpoint: activeEndpoint, alreadyRunning: true };
    }
  }

  if (!fs.existsSync(userDataDir)) {
    throw new Error(`Chrome profile directory not found at ${userDataDir}. Please re-select the profile in Settings.`);
  }

  if (isProfileDirInUse(userDataDir)) {
    throw new Error(
      `Chrome is already running for profile data at ${userDataDir}. ` +
        `Close all Chrome windows for this profile, then use "Start Chrome" so we can enable remote debugging on port ${port}.`
    );
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

  try {
    await waitForEndpoint(endpoint);
  } catch (error) {
    await terminateSpawnedProcess(child.pid);

    const guidance =
      'Chrome may already be running for this profile without remote debugging. ' +
      'Close all Chrome windows for this profile and try "Start Chrome" again, or start Chrome manually with the ' +
      `"--remote-debugging-port=${port}" flag.`;

    const message = (error as Error)?.message;
    throw new Error(message ? `${message}. ${guidance}` : guidance);
  }

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
    port: Number(new URL(endpoint).port),
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

export async function attachExistingChromeForProfile(
  profile: ChromeProfile,
  port: number
): Promise<Browser> {
  const key = instanceKey(profile);
  const existing = activeInstances.get(key);

  // Если уже есть подключённый браузер для этого профиля — просто используем его
  if (existing && existing.browser.isConnected()) {
    return existing.browser;
  }

  const { userDataDir } = await resolveProfileLaunchTarget(profile);
  const endpoint = `http://${CDP_HOST}:${port}`;

  // ВАЖНО: здесь НЕ спавним Chrome, только проверяем наличие CDP
  let targetEndpoint = endpoint;
  if (!(await isEndpointAvailable(endpoint))) {
    const activePort = await readDevToolsActivePort(userDataDir);
    if (activePort) {
      const activeEndpoint = `http://${CDP_HOST}:${activePort}`;
      if (await isEndpointAvailable(activeEndpoint)) {
        targetEndpoint = activeEndpoint;
        console.info('[chrome] attaching to detected DevTools port for profile', {
          activeEndpoint,
          requestedPort: port,
        });
      }
    }
  }

  if (!(await isEndpointAvailable(targetEndpoint))) {
    throw new Error(
      `Chrome is not running with remote debugging on port ${port}. ` +
        `Start Chrome for this session first (Start Chrome) or launch Chrome manually with "--remote-debugging-port=${port}".`
    );
  }

  const browser = (await puppeteer.connect({
    browserURL: targetEndpoint,
    defaultViewport: null,
  })) as Browser & { __soraAlreadyRunning?: boolean; __soraManaged?: boolean };

  // Это внешний (уже запущенный) Chrome
  browser.__soraAlreadyRunning = true;
  browser.__soraManaged = false;

  activeInstances.set(key, {
    key,
    browser,
    endpoint: targetEndpoint,
    port: Number(new URL(targetEndpoint).port),
    userDataDir: profile.userDataDir,
    profileDirectory: profile.profileDirectory ?? profile.profileDir ?? 'Default',
    spawned: false,
    childPid: existing?.childPid,
  });

  browser.on('disconnected', () => {
    const current = activeInstances.get(key);
    if (current && current.browser === browser) {
      activeInstances.delete(key);
    }
  });

  console.info('[chrome] attached to existing Chrome', {
    endpoint: targetEndpoint,
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

