import path from 'path';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { getConfig, updateConfig } from './config/config';
import { listChromeProfiles, scanChromeProfiles, setActiveChromeProfile, getActiveChromeProfile } from './chrome/profiles';
import { getSession, listSessions, saveSession, deleteSession } from './sessions/repo';
import { runPrompts, cancelPrompts } from './automation/promptsRunner';
import { runDownloads, cancelDownloads } from './automation/downloader';
import { runPipeline, cancelPipeline } from './automation/pipeline';
import { extractPreviewFrames, pickSmartPreviewFrames } from './video/ffmpegWatermark';
import { blurVideoWithProfile, listBlurProfiles, saveBlurProfile, deleteBlurProfile } from './video/ffmpegBlur';
import { testTelegram, sendTelegramMessage } from './integrations/telegram';
import { loggerEvents, logError } from './logging/logger';
import { getDailyStats, getTopSessions } from './logging/history';
import { getLastSelectorForSession, startInspectorForSession } from './automation/selectorInspector';
import { runCleanupNow, scheduleDailyCleanup } from './maintenance/cleanup';
import { readProfileFiles, saveProfileFiles } from './content/profileFiles';
import { sessionLogBroker } from './sessionLogs';
import { launchBrowserForSession } from './chrome/cdp';
import type { Session } from './sessions/types';
import type { SessionCommandAction } from '../shared/types';
import type { Browser } from 'puppeteer-core';

let mainWindow: BrowserWindow | null = null;
const manualBrowsers = new Map<string, Browser>();

const isDev = process.env.NODE_ENV !== 'production';

function createMainWindow(): void {
  const preload = path.join(__dirname, 'preload.js');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    frame: false,
    backgroundColor: '#09090b',
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    const indexPath = path.join(__dirname, '..', '..', 'dist', 'index.html');
    mainWindow.loadFile(indexPath);
  }

  loggerEvents.on('log', (entry) => {
    mainWindow?.webContents.send('logging:push', entry);
  });
}

function logSession(sessionId: string, scope: string, level: 'info' | 'error', message: string) {
  const entry = { timestamp: Date.now(), scope, level, message };
  sessionLogBroker.log(sessionId, entry);
}

async function resolveSessionProfile(session: Session) {
  if (session.chromeProfileName) {
    const profiles = await scanChromeProfiles();
    const found = profiles.find((p) => p.name === session.chromeProfileName);
    if (found) return found;
  }
  return getActiveChromeProfile();
}

console.log('[main] starting, NODE_ENV=', process.env.NODE_ENV);

app.whenReady()
  .then(() => {
    console.log('[main] app is ready, creating window');
    createMainWindow();
  })
  .then(() => {
    scheduleDailyCleanup();
    console.log('[main] daily cleanup scheduled');
  });

app.on('window-all-closed', () => {
  console.log('[main] window-all-closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  console.log('[main] before-quit');
  for (const browser of manualBrowsers.values()) {
    try {
      browser.close();
    } catch {
      // ignore
    }
  }
  manualBrowsers.clear();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

function handle<T extends any[]>(channel: string, fn: (...args: T) => Promise<any> | any) {
  ipcMain.handle(channel, async (_event, ...args: T) => {
    try {
      return await fn(...args);
    } catch (error) {
      const message = (error as Error)?.message || 'IPC handler failed';
      logError('ipc', `${channel}: ${message}`);
      return { ok: false, error: message };
    }
  });
}

handle('config:get', async () => getConfig());
handle('config:update', async (partial) => updateConfig(partial));

handle('chrome:scanProfiles', async () => {
  const profiles = await scanChromeProfiles();
  return { ok: true, profiles };
});
handle('chrome:listProfiles', async () => {
  const profiles = await listChromeProfiles();
  return { ok: true, profiles };
});
handle('chrome:setActiveProfile', async (name: string) => {
  await setActiveChromeProfile(name);
  const profiles = await listChromeProfiles();
  return { ok: true, profiles };
});

ipcMain.handle('sessions:subscribeLogs', (event, sessionId: string) => {
  sessionLogBroker.subscribe(sessionId, event.sender);
  return { ok: true };
});

ipcMain.handle('sessions:unsubscribeLogs', (event, sessionId: string) => {
  sessionLogBroker.unsubscribe(sessionId, event.sender.id);
  return { ok: true };
});

handle('sessions:list', async () => listSessions());
handle('sessions:get', async (id: string) => getSession(id));
handle('sessions:save', async (session) => saveSession(session));
handle('sessions:delete', async (id: string) => deleteSession(id));
handle('sessions:command', async (sessionId: string, action: SessionCommandAction) => {
  const session = await getSession(sessionId);
  if (!session) return { ok: false, error: 'Session not found' };

  const safePort = session.cdpPort && Number.isFinite(session.cdpPort) ? Number(session.cdpPort) : 9222;

  try {
    if (action === 'startChrome') {
      const profile = await resolveSessionProfile(session as Session);
      if (!profile) throw new Error('No Chrome profile available');
      const existing = manualBrowsers.get(session.id);
      if (existing) {
        try {
          await existing.close();
        } catch {
          // ignore close errors
        }
      }
      const browser = await launchBrowserForSession(profile, safePort);
      manualBrowsers.set(session.id, browser);
      logSession(session.id, 'Chrome', 'info', `Started Chrome on port ${safePort}`);
      return { ok: true, details: `Started Chrome on port ${safePort}` };
    }

    if (action === 'runPrompts') {
      logSession(session.id, 'Prompts', 'info', 'Starting prompt run');
      const result = await runPrompts(session as Session);
      logSession(session.id, 'Prompts', result.ok ? 'info' : 'error', result.ok ? 'Prompts finished' : result.error || 'Prompt run failed');
      return result;
    }

    if (action === 'runDownloads') {
      logSession(session.id, 'Download', 'info', 'Starting downloads');
      const result = await runDownloads(session as Session, session.maxVideos ?? 0);
      logSession(session.id, 'Download', result.ok ? 'info' : 'error', result.ok ? 'Downloads finished' : result.error || 'Download run failed');
      return result;
    }

    if (action === 'cleanWatermark') {
      logSession(session.id, 'Watermark', 'info', 'Watermark cleanup not implemented');
      return { ok: false, error: 'Watermark cleanup is not implemented yet' };
    }

    if (action === 'stop') {
      await cancelPrompts(session.id);
      await cancelDownloads(session.id);
      const browser = manualBrowsers.get(session.id);
      if (browser) {
        try {
          await browser.close();
        } catch {
          // ignore
        }
        manualBrowsers.delete(session.id);
      }
      logSession(session.id, 'Worker', 'info', 'Stop signal sent');
      return { ok: true, details: 'Stopped session workers' };
    }

    return { ok: false, error: `Unknown action ${action}` };
  } catch (error) {
    const message = (error as Error).message || 'Session command failed';
    logSession(session.id, 'Worker', 'error', message);
    return { ok: false, error: message };
  }
});
handle('files:read', async (profileName?: string | null) => {
  const files = await readProfileFiles(profileName);
  return { ok: true, files };
});
handle('files:save', async (profileName: string | null, files) => saveProfileFiles(profileName, files));
handle('sessions:runPrompts', async (id: string) => {
  const session = await getSession(id);
  if (!session) return { ok: false, error: 'Session not found' };
  return runPrompts(session as any);
});
handle('sessions:cancelPrompts', async (id: string) => cancelPrompts(id));
handle('sessions:runDownloads', async (id: string, maxVideos?: number) => {
  const session = await getSession(id);
  if (!session) return { ok: false, error: 'Session not found' };
  return runDownloads(session as any, maxVideos ?? 0);
});
handle('sessions:cancelDownloads', async (id: string) => cancelDownloads(id));

handle('pipeline:run', async (steps) => {
  const safeSteps = Array.isArray(steps)
    ? steps.map((step) => ({
        type: step?.type,
        sessionIds: Array.isArray(step?.sessionIds) ? step.sessionIds : [],
        limit: typeof step?.limit === 'number' ? step.limit : undefined,
        group: typeof step?.group === 'string' ? step.group : undefined,
      }))
    : [];
  await runPipeline(safeSteps, (status) => mainWindow?.webContents.send('pipeline:progress', status));
  return { ok: true };
});
handle('pipeline:cancel', async () => {
  cancelPipeline();
  return { ok: true };
});

handle('window:minimize', async () => {
  mainWindow?.minimize();
  return { ok: true };
});

handle('window:maximize', async () => {
  if (!mainWindow) return { ok: false, error: 'No window' };
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
  return { ok: true, maximized: mainWindow.isMaximized() };
});

handle('window:isMaximized', async () => {
  return mainWindow?.isMaximized() ?? false;
});

handle('window:close', async () => {
  mainWindow?.close();
  return { ok: true };
});

handle('video:extractPreviewFrames', async (videoPath: string, count: number) => extractPreviewFrames(videoPath, count));
handle('video:pickSmartPreviewFrames', async (videoPath: string, count: number) => pickSmartPreviewFrames(videoPath, count));
handle('video:blurWithProfile', async (input: string, output: string, profileId: string) =>
  blurVideoWithProfile(input, output, profileId)
);
handle('video:blurProfiles:list', async () => listBlurProfiles());
handle('video:blurProfiles:save', async (profile) => saveBlurProfile(profile));
handle('video:blurProfiles:delete', async (id: string) => deleteBlurProfile(id));

handle('telegram:test', async () => testTelegram());
handle('telegram:sendMessage', async (text: string) => sendTelegramMessage(text));

handle('analytics:getDailyStats', async (days: number) => getDailyStats(days ?? 7));
handle('analytics:getTopSessions', async (limit: number) => getTopSessions(limit ?? 5));

handle('selectorInspector:start', async (sessionId: string) => startInspectorForSession(sessionId));
handle('selectorInspector:getLast', async (sessionId: string) => getLastSelectorForSession(sessionId));

handle('cleanup:run', async () => runCleanupNow());

handle('logging:rendererError', async (payload) => {
  logError('renderer', JSON.stringify(payload));
  return { ok: true };
});

handle('system:openPath', async (target: string) => shell.openPath(target));
handle('system:openLogs', async () => shell.openPath(path.join(app.getPath('userData'), 'logs')));

// legacy
handle('ping', async () => 'pong');

export {};
