import { spawn } from 'child_process';
import http from 'http';
import puppeteer, { type Browser } from 'puppeteer-core';

import { getConfig } from '../config/config';
import { resolveChromeExecutablePath } from './paths';
import { ChromeProfile } from './profiles';

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

async function waitForEndpoint(endpoint: string, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isEndpointAvailable(endpoint)) return;
    await delay(250);
  }
  throw new Error(`Chrome CDP endpoint did not open at ${endpoint}`);
}

async function ensureChromeWithCDP(profile: ChromeProfile, port: number): Promise<string> {
  const config = await getConfig();
  const executablePath = await resolveChromeExecutablePath().catch((error) => {
    if (config.chromeExecutablePath) return config.chromeExecutablePath;
    throw error;
  });

  const endpoint = `http://${CDP_HOST}:${port}`;
  if (await isEndpointAvailable(endpoint)) {
    return endpoint;
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

  // Ensure the browser process is not tied to Electron lifecycle.
  child.unref();

  await waitForEndpoint(endpoint);
  console.info('[chrome] spawned browser for CDP', {
    executablePath,
    userDataDir: profile.userDataDir,
    profileDirectory,
    cdpPort: port,
  });

  return endpoint;
}

export async function launchBrowserForSession(
  profile: ChromeProfile,
  cdpPort: number
): Promise<Browser> {
  const endpoint = await ensureChromeWithCDP(profile, cdpPort);
  const browser = await puppeteer.connect({
    browserURL: endpoint,
    defaultViewport: null,
  });

  console.info('[chrome] connected to CDP', {
    endpoint,
    userDataDir: profile.userDataDir,
    profileDirectory: profile.profileDirectory ?? profile.profileDir,
  });

  return browser;
}
