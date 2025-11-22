import { app, BrowserWindow, ipcMain } from 'electron';

// Placeholder bootstrap for Electron main process.
// Implementation will be filled in later prompts.

let mainWindow: BrowserWindow | null = null;

function createMainWindow(): void {
  // TODO: implement window creation and IPC wiring.
  mainWindow = new BrowserWindow({});
}

app.whenReady().then(createMainWindow);

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

// IPC handlers will be registered here in future implementations.
void ipcMain;

export {};
