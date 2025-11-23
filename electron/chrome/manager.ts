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

function parsePidFromLock(lockPath: string): number | null {
  try {
    const target = fs.readlinkSync(lockPath);
    const match = target.match(/(\d+)/);
    if (match) return Number(match[1]);
  } catch {
    // not a symlink; fall through
  }

  try {
    const content = fs.readFileSync(lockPath, 'utf8');
    const match = content.match(/(\d+)/);
    if (match) return Number(match[1]);
  } catch {
    // ignore read errors
  }

  return null;
}

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    return !(code === 'ESRCH' || code === 'EPERM');
  }
}

function isProfileDirInUse(userDataDir: string): boolean {
  const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];

  for (const file of lockFiles) {
    const lockPath = path.join(userDataDir, file);
    if (!fs.existsSync(lockPath)) continue;

    const pid = parsePidFromLock(lockPath);

    if (pid !== null && isPidRunning(pid)) {
      return true;
    }

    try {
      fs.unlinkSync(lockPath);
    } catch {
      // If we cannot remove it, assume the profile is in use to stay safe
      return true;
    }
  }

  return false;
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
  throw new Error(
    [
      `Chrome CDP endpoint did not open at ${endpoint}.`,
      '',
      'This usually means Chrome failed to start with remote debugging enabled.',
      'Possible reasons:',
      '  - Chrome is already running for this profile without "--remote-debugging-port".',
      '  - The specified port is blocked by another process.',
      '',
      'Fix:',
      '  1) Fully quit all Google Chrome windows for this profile (Cmd+Q on macOS, or "Quit" from the Dock).',
      '  2) In the Sora Bot app, click "Start Chrome" again for this session.',
      '  3) If the problem persists, try changing the "CDP port" in Settings to a free port (e.g., 9223) and restart the app.',
    ].join('\n')
  );
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

async function findDevToolsActivePort(candidateDirs: Iterable<string>): Promise<number | null> {
  for (const dir of candidateDirs) {
    const port = await readDevToolsActivePort(dir);
    if (port) return port;
  }
  return null;
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
  const activePort = await findDevToolsActivePort(new Set([userDataDir, profile.userDataDir].filter(Boolean)));
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
      [
        `Chrome is already running for profile data at: ${userDataDir}`,
        '',
        'To allow Sora Bot to control this profile, Chrome must be started with remote debugging enabled.',
        'Steps:',
        '  1) Fully quit Google Chrome for this profile:',
        '     - On macOS: press Cmd+Q in Chrome, or right-click the Dock icon and choose "Quit".',
        '     - Make sure there are no "Google Chrome" processes left in Activity Monitor.',
        `  2) In the Sora Bot app, click "Start Chrome" for this session so we can launch Chrome with "--remote-debugging-port=${port}".`,
        '  3) Then open https://sora.chatgpt.com in that Chrome window and run downloads/prompts again.',
      ].join('\n')
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

  console.info('[chrome] attachExistingChromeForProfile: checking activeInstances', {
    key,
    hasExisting: !!existing,
    isConnected: !!existing?.browser?.isConnected(),
  });

  // Если уже есть подключённый браузер для этого профиля — просто используем его
  if (existing && existing.browser.isConnected()) {
    return existing.browser;
  }

  const { userDataDir } = await resolveProfileLaunchTarget(profile);
  const requestedEndpoint = `http://${CDP_HOST}:${port}`;
  let targetEndpoint: string | null = null;

  if (await isEndpointAvailable(requestedEndpoint)) {
    targetEndpoint = requestedEndpoint;
  } else {
    const activePort = await findDevToolsActivePort(new Set([userDataDir, profile.userDataDir].filter(Boolean)));
    console.info('[chrome] attachExistingChromeForProfile: DevToolsActivePort read', {
      userDataDir,
      activePort,
      requestedPort: port,
    });
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

  if (!targetEndpoint) {
    console.warn(
      '[chrome] attachExistingChromeForProfile: no DevTools endpoint found, falling back to getOrLaunchChromeForProfile',
      {
        requestedPort: port,
        userDataDir,
      }
    );

    return getOrLaunchChromeForProfile(profile, port);
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
    spawned: existing?.spawned ?? false,
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

