import { contextBridge, ipcRenderer } from 'electron';

// Expose a minimal bridge; implementations will be added later.
contextBridge.exposeInMainWorld('electronAPI', {
  // Example placeholder methods
  ping: (): Promise<string> => ipcRenderer.invoke('ping'),
});

export {};
