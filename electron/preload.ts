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
  },
  pipeline: {
    run: (steps: unknown) => ipcRenderer.invoke("pipeline:run", steps),
    cancel: () => ipcRenderer.invoke("pipeline:cancel"),
    onProgress: (listener: (status: unknown) => void): Unsubscribe =>
      withListener("pipeline:progress", listener),
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
  },
};

contextBridge.exposeInMainWorld("electronAPI", api);

export type PreloadAPI = typeof api;

export default api;
