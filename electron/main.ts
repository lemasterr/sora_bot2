import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { loadConfig, saveConfig } from './config';
import { SessionManager } from './sessionManager';
import { cancelSessionRun, runDownloads, runPrompts } from './automation/sessionAutomation';
import { setChromeExecutablePath, type SessionRunContext } from './automation/chromeController';
import { generateWatermarkFrames } from './watermark';
import { sendTestMessage } from './telegram';
import type {
  Config,
  DownloadedVideo,
  RunResult,
  SessionFiles,
  SessionInfo,
  WatermarkFramesResult
} from '../shared/types';

const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;
let sessionManager: SessionManager | null = null;
let currentConfig: Config | null = null;

const createWindow = () => {
  const preloadPath = isDev ? path.join(__dirname, 'preload.ts') : path.join(__dirname, 'preload.js');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#0f172a',
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

  ipcMain.handle('dialog:choose-folder', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory']
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
