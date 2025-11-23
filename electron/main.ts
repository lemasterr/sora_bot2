import path from 'path';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { getConfig, updateConfig } from './config/config';
import { listChromeProfiles, scanChromeProfiles, setActiveChromeProfile } from './chrome/profiles';
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

let mainWindow: BrowserWindow | null = null;

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
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    mainWindow.loadFile(indexPath);
  }

  loggerEvents.on('log', (entry) => {
    mainWindow?.webContents.send('logging:push', entry);
  });
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

handle('sessions:list', async () => listSessions());
handle('sessions:get', async (id: string) => getSession(id));
handle('sessions:save', async (session) => saveSession(session));
handle('sessions:delete', async (id: string) => deleteSession(id));
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
