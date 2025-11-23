import { spawn } from 'child_process';
import http from 'http';
import puppeteer, { type Browser } from 'puppeteer-core';

import { getConfig } from '../config/config';
import { resolveChromeExecutablePath } from './paths';
import { ChromeProfile } from './profiles';

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

  const profileDirectory = profile.profileDirectory ?? profile.profileDir ?? 'Default';
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile.userDataDir}`,
    `--profile-directory=${profileDirectory}`,
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
    userDataDir: profile.userDataDir,
    profileDirectory,
    cdpPort: port,
  });

  return { endpoint, alreadyRunning: false, childPid: child.pid };
}

function instanceKey(profile: ChromeProfile): string {
  const name = profile.name ?? 'profile';
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

  browser.__soraAlreadyRunning = true; // keep windows open between runs
  browser.__soraManaged = true;

  const profileDirectory = profile.profileDirectory ?? profile.profileDir ?? 'Default';

  activeInstances.set(key, {
    key,
    browser,
    endpoint,
    port,
    userDataDir: profile.userDataDir,
    profileDirectory,
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
    profileDirectory,
  });

  return browser;
}

export function closeChromeForProfile(profile: ChromeProfile): void {
  const key = instanceKey(profile);
  const existing = activeInstances.get(key);
  if (existing) {
    activeInstances.delete(key);
    try {
      existing.browser.close();
    } catch {
      // ignore close errors
    }
  }
}

export function shutdownAllChrome(): void {
  for (const instance of activeInstances.values()) {
    try {
      instance.browser.close();
    } catch {
      // ignore
    }
  }
  activeInstances.clear();
}

