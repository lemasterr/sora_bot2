import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { loadConfig, saveConfig } from './config';
import { SessionManager } from './sessionManager';
import { cancelSessionRun, runDownloads, runPrompts } from './automation/sessionAutomation';
import { setChromeExecutablePath, type SessionRunContext } from './automation/chromeController';
import { generateWatermarkFrames } from './watermark';
import { sendTestMessage } from './telegram';
import {
  listChromeProfiles,
  removeChromeProfile,
  saveChromeProfile,
  scanAndStoreChromeProfiles,
  setActiveChromeProfile
} from './chromeProfiles';
import { listManagedSessions, removeManagedSession, saveManagedSession } from './sessionRegistry';
import type {
  Config,
  DownloadedVideo,
  RunResult,
  SessionFiles,
  SessionInfo,
  WatermarkFramesResult,
  ChromeProfile,
  ManagedSession,
  SessionCommandAction
} from '../shared/types';
import { sessionLogBroker } from './sessionLogs';

const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;
let sessionManager: SessionManager | null = null;
let currentConfig: Config | null = null;
const sessionRunStates = new Map<string, ManagedSession['status']>();

const logSession = (sessionId: string, scope: string, message: string, level: 'info' | 'error' = 'info') => {
  sessionLogBroker.log(sessionId, {
    timestamp: Date.now(),
    scope,
    level,
    message
  });
};

const createWindow = () => {
  const preloadPath = isDev ? path.join(__dirname, 'preload.ts') : path.join(__dirname, 'preload.js');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      preload: preloadPath
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(__dirname, '../dist/index.html');
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized', false);
  });
};

const registerIpc = () => {
  ipcMain.handle('config:get', async () => {
    if (!currentConfig) {
      currentConfig = await loadConfig();
      setChromeExecutablePath(currentConfig.chromeExecutablePath);
    }
    return currentConfig;
  });

  ipcMain.handle('config:update', async (_event, partial: Partial<Config>) => {
    await saveConfig(partial);
    currentConfig = await loadConfig();
    setChromeExecutablePath(currentConfig.chromeExecutablePath);
    if (sessionManager && partial.sessionsRoot) {
      sessionManager.setSessionsRoot(currentConfig.sessionsRoot);
    }
    return currentConfig;
  });

  ipcMain.handle('chrome:list', async (): Promise<ChromeProfile[]> => {
    const profiles = await listChromeProfiles();
    currentConfig = await loadConfig();
    return profiles;
  });

  ipcMain.handle('chrome:scan', async (): Promise<ChromeProfile[]> => {
    const profiles = await scanAndStoreChromeProfiles();
    currentConfig = await loadConfig();
    return profiles;
  });

  ipcMain.handle('chrome:setActive', async (_event, name: string): Promise<ChromeProfile[]> => {
    const profiles = await setActiveChromeProfile(name);
    currentConfig = await loadConfig();
    return profiles;
  });

  ipcMain.handle('chrome:save', async (_event, profile: ChromeProfile): Promise<ChromeProfile[]> => {
    const profiles = await saveChromeProfile(profile);
    currentConfig = await loadConfig();
    return profiles;
  });

  ipcMain.handle('chrome:remove', async (_event, name: string): Promise<ChromeProfile[]> => {
    const profiles = await removeChromeProfile(name);
    currentConfig = await loadConfig();
    return profiles;
  });

  ipcMain.handle('sessions:get', async (): Promise<SessionInfo[]> => {
    return sessionManager ? sessionManager.listSessions() : [];
  });

  ipcMain.handle('sessions:listDownloads', async (): Promise<DownloadedVideo[]> => {
    if (!sessionManager) return [];
    return sessionManager.listDownloadedVideos();
  });

  ipcMain.handle('sessions:create', async (_event, name: string): Promise<SessionInfo> => {
    if (!sessionManager) {
      throw new Error('Session manager not initialized');
    }
    return sessionManager.createSession(name);
  });

  ipcMain.handle('sessions:readFiles', async (_event, name: string): Promise<SessionFiles> => {
    if (!sessionManager) {
      throw new Error('Session manager not initialized');
    }
    return sessionManager.readSessionFiles(name);
  });

  ipcMain.handle('sessions:writeFiles', async (_event, name: string, data: SessionFiles): Promise<void> => {
    if (!sessionManager) {
      throw new Error('Session manager not initialized');
    }
    await sessionManager.writeSessionFiles(name, data);
  });

  ipcMain.handle('sessions:registry:list', async (): Promise<ManagedSession[]> => {
    const sessions = await listManagedSessions();
    return sessions.map((session) => ({ ...session, status: sessionRunStates.get(session.id) || session.status || 'idle' }));
  });

  ipcMain.handle('sessions:registry:save', async (_event, session: ManagedSession): Promise<ManagedSession[]> => {
    const saved = await saveManagedSession(session);
    return saved.map((entry) => ({ ...entry, status: sessionRunStates.get(entry.id) || entry.status || 'idle' }));
  });

  ipcMain.handle('sessions:registry:remove', async (_event, id: string): Promise<ManagedSession[]> => {
    sessionRunStates.delete(id);
    const saved = await removeManagedSession(id);
    return saved.map((entry) => ({ ...entry, status: sessionRunStates.get(entry.id) || entry.status || 'idle' }));
  });

  ipcMain.handle('sessions:logs:subscribe', (event, id: string) => {
    sessionLogBroker.subscribe(id, event.sender);
    return { ok: true };
  });

  ipcMain.handle('sessions:logs:unsubscribe', (event, id: string) => {
    sessionLogBroker.unsubscribe(id, event.sender.id);
    return { ok: true };
  });

  const setSessionStatus = (id: string, status: ManagedSession['status']) => {
    sessionRunStates.set(id, status);
  };

  const handleSessionCommand = async (id: string, action: SessionCommandAction): Promise<RunResult> => {
    try {
      setSessionStatus(id, action === 'stop' ? 'idle' : 'running');
      const label =
        action === 'startChrome'
          ? 'Chrome'
          : action === 'runPrompts'
            ? 'Prompts'
            : action === 'runDownloads'
              ? 'Download'
              : action === 'cleanWatermark'
                ? 'Watermark'
                : 'Worker';

      logSession(id, label, `${action} requested`);

      // stub operational logs to visualize streaming
      setTimeout(() => logSession(id, label, 'Working...'), 500);
      setTimeout(() => logSession(id, label, 'Still running...'), 1200);
      setTimeout(() => logSession(id, label, 'Done'), 2000);

      if (action === 'stop') {
        logSession(id, 'Worker', 'Stopped by user');
        return { ok: true, details: 'Stopped' };
      }

      return { ok: true, details: `${action} started` };
    } catch (error) {
      setSessionStatus(id, 'error');
      const message = error instanceof Error ? error.message : 'Unknown error';
      logSession(id, 'Worker', message, 'error');
      return { ok: false, error: message };
    }
  };

  ipcMain.handle('sessions:runPrompts', async (_event, id: string): Promise<RunResult> => {
    return handleSessionCommand(id, 'runPrompts');
  });

  ipcMain.handle('sessions:runDownloads', async (_event, id: string): Promise<RunResult> => {
    return handleSessionCommand(id, 'runDownloads');
  });

  ipcMain.handle('sessions:stop', async (_event, id: string): Promise<RunResult> => {
    return handleSessionCommand(id, 'stop');
  });

  ipcMain.handle('sessions:command', async (_event, id: string, action: SessionCommandAction) => {
    return handleSessionCommand(id, action);
  });

  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('window:maximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.handle('window:close', () => {
    mainWindow?.close();
  });

  ipcMain.handle('window:isMaximized', () => {
    return mainWindow?.isMaximized() ?? false;
  });

  ipcMain.handle('dialog:choose-folder', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:choose-file', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  const buildSessionContext = async (sessionName: string): Promise<SessionRunContext> => {
    if (!sessionManager || !currentConfig) {
      throw new Error('Session manager not initialized');
    }

    const paths = await sessionManager.getSessionPaths(sessionName);

    return {
      sessionName,
      ...paths,
      config: currentConfig,
      cancelled: false
    };
  };

  const handleAutomation = async (runner: () => Promise<RunResult>): Promise<RunResult> => {
    try {
      return await runner();
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  };

  ipcMain.handle('automation:run-prompts', async (_event, sessionName: string): Promise<RunResult> => {
    return handleAutomation(async () => {
      const ctx = await buildSessionContext(sessionName);
      return runPrompts(ctx);
    });
  });

  ipcMain.handle(
    'automation:run-downloads',
    async (_event, sessionName: string, maxVideos: number): Promise<RunResult> => {
      return handleAutomation(async () => {
        const ctx = await buildSessionContext(sessionName);
        return runDownloads(ctx, maxVideos);
      });
    }
  );

  ipcMain.handle('automation:cancel', async (_event, sessionName: string): Promise<RunResult> => {
    const cancelled = cancelSessionRun(sessionName);
    if (cancelled) {
      return { ok: true, details: 'Cancellation requested' };
    }
    return { ok: false, error: 'No running session for cancellation' };
  });

  ipcMain.handle('watermark:frames', async (_event, videoPath: string): Promise<WatermarkFramesResult> => {
    if (!currentConfig) {
      throw new Error('Config not loaded');
    }
    return generateWatermarkFrames(videoPath, currentConfig.ffmpegPath);
  });

  ipcMain.handle('telegram:test', async (): Promise<{ ok: boolean; error?: string; details?: string }> => {
    if (!currentConfig) {
      currentConfig = await loadConfig();
    }
    return sendTestMessage(currentConfig.telegramBotToken, currentConfig.telegramChatId);
  });
};

app.whenReady().then(async () => {
  currentConfig = await loadConfig();
  setChromeExecutablePath(currentConfig.chromeExecutablePath);
  sessionManager = new SessionManager(currentConfig.sessionsRoot);
  registerIpc();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
