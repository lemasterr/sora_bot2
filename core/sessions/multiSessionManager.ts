import { spawn } from 'child_process';
import { connect, type Browser, type Page } from 'puppeteer-core';

import { launchChromeWithCDP, waitForCDP } from '../chrome/chromeLauncher';
import { resolveProfilePath } from '../chrome/profiles';
import type { DownloadLoopResult } from '../download/downloadFlow';
import { runDownloadLoop } from '../download/downloadFlow';
import { logError, logInfo, logStep } from '../utils/log';
import { retry } from '../utils/retry';

export interface SessionConfig {
  sessionId: string;
  profileId: string;
  cdpPort: number;
  maxDownloads: number;
}

export type DownloadFlowOptions = Omit<
  Parameters<typeof runDownloadLoop>[0],
  'page' | 'maxDownloads'
>;

export type SessionDownloadOutcome = {
  sessionId: string;
  profilePath: string;
  completed: number;
  result?: DownloadLoopResult;
  error?: string;
};

async function fetchWebSocketDebuggerUrl(port: number): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${port}/json/version`);
  if (!response.ok) {
    throw new Error(`Failed to query CDP version endpoint on port ${port}`);
  }

  const payload = (await response.json()) as { webSocketDebuggerUrl?: string };
  if (!payload?.webSocketDebuggerUrl) {
    throw new Error(`CDP endpoint did not return a websocket URL for port ${port}`);
  }

  return payload.webSocketDebuggerUrl;
}

async function connectOverCDP(port: number): Promise<Browser> {
  const wsEndpoint = await fetchWebSocketDebuggerUrl(port);
  return connect({ browserWSEndpoint: wsEndpoint });
}

async function closeBrowser(browser: Browser | null | undefined): Promise<void> {
  if (!browser) return;
  try {
    await browser.close();
  } catch {
    // ignore close errors
  }
}

async function terminatePid(pid?: number) {
  if (!pid) return;

  try {
    if (process.platform === 'win32') {
      await new Promise<void>((resolve) => {
        const killer = spawn('taskkill', ['/PID', `${pid}`, '/T', '/F'], {
          stdio: 'ignore',
        });
        killer.on('exit', () => resolve());
        killer.on('error', () => resolve());
      });
      return;
    }

    process.kill(pid, 'SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 300));
    try {
      process.kill(pid, 0);
      process.kill(pid, 'SIGKILL');
    } catch {
      // already exited
    }
  } catch {
    // ignore failures
  }
}

export async function runMultiSessionDownload(
  sessions: SessionConfig[],
  flows: {
    createPage: (cdpPort: number) => Promise<Page>;
    downloadFlow: typeof runDownloadLoop;
    downloadOptions: DownloadFlowOptions;
  }
): Promise<SessionDownloadOutcome[]> {
  const outcomes: SessionDownloadOutcome[] = [];
  const usedPorts = new Set<number>();

  for (const session of sessions) {
    if (usedPorts.has(session.cdpPort)) {
      throw new Error(`Duplicate CDP port detected: ${session.cdpPort}`);
    }
    usedPorts.add(session.cdpPort);
  }

  for (const session of sessions) {
    const outcome: SessionDownloadOutcome = {
      sessionId: session.sessionId,
      profilePath: '',
      completed: 0,
    };

    let browser: Browser | null = null;
    let chromePid: number | undefined;
    let page: Page | null = null;

    try {
      logStep(`Starting session ${session.sessionId} on port ${session.cdpPort}`);
      const profilePath = resolveProfilePath(session.profileId);
      outcome.profilePath = profilePath;

      const launchResult = await retry(
        () =>
          launchChromeWithCDP({
            profilePath,
            cdpPort: session.cdpPort,
          }),
        2,
        500
      );
      chromePid = launchResult.pid;

      await retry(() => waitForCDP(launchResult.cdpPort), 2, 500);
      browser = await retry(() => connectOverCDP(launchResult.cdpPort), 2, 500);

      page = await retry(() => flows.createPage(launchResult.cdpPort), 1, 400);
      const result = await flows.downloadFlow({
        ...flows.downloadOptions,
        page,
        maxDownloads: session.maxDownloads,
      });

      outcome.completed = result.completed;
      outcome.result = result;
      logInfo(`Session ${session.sessionId} finished with ${result.completed} downloads`);
    } catch (error) {
      outcome.error = (error as Error).message;
      logError(`Session ${session.sessionId} failed`, error);
    } finally {
      await closeBrowser(page?.browser?.() ?? browser);
      await terminatePid(chromePid);
    }

    outcomes.push(outcome);
  }

  return outcomes;
}
