import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

type Unsubscribe = () => void;

const withListener = <T>(channel: string, listener: (data: T) => void): Unsubscribe => {
  const wrapped = (_event: IpcRendererEvent, data: T) => listener(data);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
};

const api = {
  config: {
    get: () => ipcRenderer.invoke("config:get"),
    update: (partial: unknown) => ipcRenderer.invoke("config:update", partial),
  },
  chrome: {
    scanProfiles: () => ipcRenderer.invoke("chrome:scanProfiles"),
    setActiveProfile: (name: string) => ipcRenderer.invoke("chrome:setActiveProfile", name),
    // Legacy compatibility shims
    list: () => ipcRenderer.invoke("chrome:scanProfiles"),
    scan: () => ipcRenderer.invoke("chrome:scanProfiles"),
    save: async (profile: unknown) => {
      const name = (profile as any)?.name;
      if (name) {
        await ipcRenderer.invoke("chrome:setActiveProfile", name);
      }
      return ipcRenderer.invoke("chrome:scanProfiles");
    },
    remove: async () => ipcRenderer.invoke("chrome:scanProfiles"),
  },
  sessions: {
    list: () => ipcRenderer.invoke("sessions:list"),
    get: (id: string) => ipcRenderer.invoke("sessions:get", id),
    save: (session: unknown) => ipcRenderer.invoke("sessions:save", session),
    delete: (id: string) => ipcRenderer.invoke("sessions:delete", id),
    runPrompts: (id: string) => ipcRenderer.invoke("sessions:runPrompts", id),
    cancelPrompts: (id: string) => ipcRenderer.invoke("sessions:cancelPrompts", id),
    runDownloads: (id: string, maxVideos: number) =>
      ipcRenderer.invoke("sessions:runDownloads", id, maxVideos),
    cancelDownloads: (id: string) => ipcRenderer.invoke("sessions:cancelDownloads", id),
    // Legacy shims
    subscribeLogs: (_id: string, listener: (entry: unknown) => void): Unsubscribe =>
      withListener("logging:entry", listener),
    command: (_id: string, _action: unknown) => Promise.resolve({ ok: false, message: "Not implemented in dev" }),
  },
  pipeline: {
    run: (steps: unknown) => ipcRenderer.invoke("pipeline:run", steps),
    cancel: () => ipcRenderer.invoke("pipeline:cancel"),
    onProgress: (listener: (status: unknown) => void): Unsubscribe =>
      withListener("pipeline:progress", listener),
    // Legacy alias
    stop: () => ipcRenderer.invoke("pipeline:cancel"),
  },
  video: {
    extractPreviewFrames: (videoPath: string, count: number) =>
      ipcRenderer.invoke("video:extractPreviewFrames", videoPath, count),
    cleanWatermarkBatch: (inputDir: string, outputDir: string) =>
      ipcRenderer.invoke("video:cleanWatermarkBatch", inputDir, outputDir),
  },
  telegram: {
    test: () => ipcRenderer.invoke("telegram:test"),
    sendMessage: (text: string) => ipcRenderer.invoke("telegram:sendMessage", text),
  },
  logging: {
    onLog: (listener: (entry: unknown) => void): Unsubscribe =>
      withListener("logging:entry", listener),
    // Legacy alias
    subscribe: (listener: (entry: unknown) => void): Unsubscribe =>
      withListener("logging:entry", listener),
    export: async () => ipcRenderer.invoke("logging:export"),
  },
  logs: {
    subscribe: (listener: (entry: unknown) => void): Unsubscribe =>
      withListener("logging:entry", listener),
    export: async () => ipcRenderer.invoke("logging:export"),
  },
  // Legacy top-level conveniences used by renderer prior to IPC namespacing
  getSessions: () => ipcRenderer.invoke("sessions:list"),
  getConfig: () => ipcRenderer.invoke("config:get"),
  updateConfig: (partial: unknown) => ipcRenderer.invoke("config:update", partial),
  chooseSessionsRoot: async () => null,
  listDownloadedVideos: async () => [],
  downloader: {
    openDrafts: async () => ({ ok: false, error: "Not implemented in dev build" }),
    scanDrafts: async () => ({ ok: false, error: "Not implemented in dev build" }),
    downloadAll: async () => ({ ok: false, error: "Not implemented in dev build" }),
  },
  watermark: {
    listMasks: async () => [],
    detect: async () => ({ frames: [], suggestedMask: undefined }),
    saveMask: async (mask: unknown) => mask,
    clean: async () => ({ ok: false, items: [], error: "Not implemented" }),
  },
  files: {
    read: async () => ({ prompts: [], imagePrompts: [], titles: [] }),
    save: async () => ({ ok: true }),
  },
  telegramTest: () => ipcRenderer.invoke("telegram:test"),
};

contextBridge.exposeInMainWorld("electronAPI", api);

export type PreloadAPI = typeof api;

export default api;
