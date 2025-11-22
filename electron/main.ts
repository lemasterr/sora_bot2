import { app, BrowserWindow } from 'electron';
import path from 'path';

const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;

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

app.whenReady().then(createWindow);

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
