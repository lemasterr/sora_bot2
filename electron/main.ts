import { BrowserWindow, IpcMain, app } from "electron";

export interface MainWindowContext {
  mainWindow: BrowserWindow | null;
}

export const createMainWindow = (ctx: MainWindowContext): BrowserWindow | null => {
  return null;
};

export const registerIpcHandlers = (ipc: IpcMain): void => {
  void ipc;
};

export const registerAppEvents = (): void => {
  // Placeholder for app event wiring (ready, activate, window-all-closed).
};

export const bootstrap = (): void => {
  void app;
};

export default bootstrap;
