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
  selectorInspector: {
    start: (sessionId: string): Promise<unknown> =>
      ipcRenderer.invoke('selectorInspector:start', sessionId),
    getLast: (sessionId: string): Promise<unknown> =>
      ipcRenderer.invoke('selectorInspector:getLast', sessionId),
  },
  cleanup: {
    run: (): Promise<unknown> => ipcRenderer.invoke('cleanup:run'),
  },
});

export {};
