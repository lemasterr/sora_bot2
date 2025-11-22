import { contextBridge, ipcRenderer } from 'electron';

const safeInvoke = async (channel: string, ...args: unknown[]) => {
  try {
    return await ipcRenderer.invoke(channel, ...args);
  } catch (error) {
    console.error('IPC invoke failed', channel, error);
    return { ok: false, error: (error as Error)?.message || 'IPC failed' };
  }
};

contextBridge.exposeInMainWorld('electronAPI', {
  ping: (): Promise<unknown> => safeInvoke('ping'),
  config: {
    get: (): Promise<unknown> => safeInvoke('config:get'),
    update: (partial: unknown): Promise<unknown> => safeInvoke('config:update', partial),
  },
  chrome: {
    scanProfiles: (): Promise<unknown> => safeInvoke('chrome:scanProfiles'),
    listProfiles: (): Promise<unknown> => safeInvoke('chrome:listProfiles'),
    setActiveProfile: (name: string): Promise<unknown> => safeInvoke('chrome:setActiveProfile', name),
  },
  sessions: {
    list: (): Promise<unknown> => safeInvoke('sessions:list'),
    get: (id: string): Promise<unknown> => safeInvoke('sessions:get', id),
    save: (session: unknown): Promise<unknown> => safeInvoke('sessions:save', session),
    delete: (id: string): Promise<unknown> => safeInvoke('sessions:delete', id),
    runPrompts: (id: string): Promise<unknown> => safeInvoke('sessions:runPrompts', id),
    cancelPrompts: (id: string): Promise<unknown> => safeInvoke('sessions:cancelPrompts', id),
    runDownloads: (id: string, maxVideos?: number): Promise<unknown> =>
      safeInvoke('sessions:runDownloads', id, maxVideos ?? 0),
    cancelDownloads: (id: string): Promise<unknown> => safeInvoke('sessions:cancelDownloads', id),
  },
  pipeline: {
    run: (steps: unknown): Promise<unknown> => safeInvoke('pipeline:run', steps),
    cancel: (): Promise<unknown> => safeInvoke('pipeline:cancel'),
    onProgress: (cb: (status: unknown) => void) => {
      ipcRenderer.removeAllListeners('pipeline:progress');
      ipcRenderer.on('pipeline:progress', (_event, status) => cb(status));
      return () => ipcRenderer.removeAllListeners('pipeline:progress');
    },
  },
  video: {
    extractPreviewFrames: (videoPath: string, count: number): Promise<unknown> =>
      safeInvoke('video:extractPreviewFrames', videoPath, count),
    pickSmartPreviewFrames: (videoPath: string, count: number): Promise<unknown> =>
      safeInvoke('video:pickSmartPreviewFrames', videoPath, count),
    blurWithProfile: (input: string, output: string, profileId: string): Promise<unknown> =>
      safeInvoke('video:blurWithProfile', input, output, profileId),
    blurProfiles: {
      list: (): Promise<unknown> => safeInvoke('video:blurProfiles:list'),
      save: (profile: unknown): Promise<unknown> => safeInvoke('video:blurProfiles:save', profile),
      delete: (id: string): Promise<unknown> => safeInvoke('video:blurProfiles:delete', id),
    },
  },
  cleanup: {
    run: (): Promise<unknown> => safeInvoke('cleanup:run'),
  },
  telegram: {
    test: (): Promise<unknown> => safeInvoke('telegram:test'),
    sendMessage: (text: string): Promise<unknown> => safeInvoke('telegram:sendMessage', text),
  },
  analytics: {
    getDailyStats: (days: number): Promise<unknown> => safeInvoke('analytics:getDailyStats', days),
    getTopSessions: (limit: number): Promise<unknown> => safeInvoke('analytics:getTopSessions', limit),
  },
  selectorInspector: {
    start: (sessionId: string): Promise<unknown> => safeInvoke('selectorInspector:start', sessionId),
    getLast: (sessionId: string): Promise<unknown> => safeInvoke('selectorInspector:getLast', sessionId),
  },
  logging: {
    rendererError: (payload: unknown): Promise<unknown> => safeInvoke('logging:rendererError', payload),
    onLog: (cb: (entry: unknown) => void) => {
      ipcRenderer.removeAllListeners('logging:push');
      ipcRenderer.on('logging:push', (_event, entry) => cb(entry));
    },
  },
  system: {
    openPath: (target: string): Promise<unknown> => safeInvoke('system:openPath', target),
    openLogs: (): Promise<unknown> => safeInvoke('system:openLogs'),
  },
});

export {};
