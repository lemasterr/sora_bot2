import { contextBridge, ipcRenderer } from 'electron';

// Expose a minimal bridge; implementations will be added later.
contextBridge.exposeInMainWorld('electronAPI', {
  // Example placeholder methods
  ping: (): Promise<string> => ipcRenderer.invoke('ping'),
  analytics: {
    getDailyStats: (days: number): Promise<unknown> =>
      ipcRenderer.invoke('analytics:getDailyStats', days),
    getTopSessions: (limit: number): Promise<unknown> =>
      ipcRenderer.invoke('analytics:getTopSessions', limit),
  },
});

export {};
