import { app, BrowserWindow, ipcMain } from 'electron';
import { getDailyStats, getTopSessions } from './logging/history';
import { getLastSelectorForSession, startInspectorForSession } from './automation/selectorInspector';
import { runCleanupNow, scheduleDailyCleanup } from './maintenance/cleanup';

// Placeholder bootstrap for Electron main process with minimal IPC wiring.

let mainWindow: BrowserWindow | null = null;

function createMainWindow(): void {
  // TODO: implement window creation and IPC wiring.
  mainWindow = new BrowserWindow({});
}

app.whenReady().then(createMainWindow);
app.whenReady().then(scheduleDailyCleanup);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

ipcMain.handle('analytics:getDailyStats', async (_event, days: number) => {
  return getDailyStats(days ?? 7);
});

ipcMain.handle('analytics:getTopSessions', async (_event, limit: number) => {
  return getTopSessions(limit ?? 5);
});

ipcMain.handle('selectorInspector:start', async (_event, sessionId: string) => {
  return startInspectorForSession(sessionId);
});

ipcMain.handle('selectorInspector:getLast', async (_event, sessionId: string) => {
  return getLastSelectorForSession(sessionId);
});

ipcMain.handle('cleanup:run', async () => {
  return runCleanupNow();
});

export {};
