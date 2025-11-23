import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';

import { resolveChromeExecutablePath } from '../../electron/chrome/paths';

const CDP_HOST = '127.0.0.1';

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

async function waitForCdp(port: number, timeoutMs = 15000): Promise<void> {
  const endpoint = `http://${CDP_HOST}:${port}/json/version`;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isEndpointAvailable(endpoint)) return;
    await delay(250);
  }
  throw new Error(`Chrome CDP endpoint did not open at ${endpoint}`);
}

async function terminateSpawnedProcess(pid?: number) {
  if (!pid) return;

  if (process.platform === 'win32') {
    return new Promise<void>((resolve) => {
      const killer = spawn('taskkill', ['/PID', `${pid}`, '/T', '/F'], { stdio: 'ignore' });
      killer.on('exit', () => resolve());
      killer.on('error', () => resolve());
    });
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // ignore
  }

  await delay(300);

  try {
    process.kill(pid, 0);
    process.kill(pid, 'SIGKILL');
  } catch {
    // ignore if already exited
  }
}

function buildLaunchArgs(profilePath: string, cdpPort: number, extraArgs: string[] = []): string[] {
  const defaultArgs = [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profilePath}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=AutomationControlled',
    '--disable-component-update',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-dev-shm-usage',
    '--disable-session-crashed-bubble',
    '--disable-features=Translate',
    '--start-maximized',
  ];

  return [...defaultArgs, ...extraArgs];
}

export async function launchChromeWithCDP(options: {
  profilePath: string;
  cdpPort: number;
  extraArgs?: string[];
}): Promise<{
  pid: number;
  cdpPort: number;
  profilePath: string;
}> {
  const { profilePath, cdpPort, extraArgs = [] } = options;

  if (!profilePath || !fs.existsSync(profilePath)) {
    throw new Error(`Chrome profile directory not found: ${profilePath}`);
  }

  const executablePath = await resolveChromeExecutablePath();
  const args = buildLaunchArgs(profilePath, cdpPort, extraArgs);

  const child = spawn(executablePath, args, {
    detached: true,
    stdio: 'ignore',
  });

  child.unref();

  try {
    await waitForCdp(cdpPort);
  } catch (error) {
    await terminateSpawnedProcess(child.pid);
    throw error;
  }

  return { pid: child.pid ?? -1, cdpPort, profilePath: path.resolve(profilePath) };
}
