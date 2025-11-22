import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { loadConfig, saveConfig } from './config';
import { SessionManager } from './sessionManager';
import type { Config, SessionFiles, SessionInfo } from '../shared/types';

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
    }
    return currentConfig;
  });

  ipcMain.handle('config:update', async (_event, partial: Partial<Config>) => {
    await saveConfig(partial);
    currentConfig = await loadConfig();
    if (sessionManager && partial.sessionsRoot) {
      sessionManager.setSessionsRoot(currentConfig.sessionsRoot);
    }
    return currentConfig;
  });

  ipcMain.handle('sessions:get', async (): Promise<SessionInfo[]> => {
    return sessionManager ? sessionManager.listSessions() : [];
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
};

app.whenReady().then(async () => {
  currentConfig = await loadConfig();
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
