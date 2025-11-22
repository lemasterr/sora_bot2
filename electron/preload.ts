import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type {
  Config,
  DownloadedVideo,
  ChromeProfile,
  ManagedSession,
  SessionCommandAction,
  SessionLogEntry,
  RunResult,
  SessionFiles,
  SessionInfo,
  WatermarkFramesResult,
  WatermarkDetectionResult,
  WatermarkMask,
  WatermarkCleanResult,
  PipelineStep,
  PipelineProgress
} from '../shared/types';

type Listener = (event: IpcRendererEvent, data: unknown) => void;

const electronAPI = {
  invoke: (channel: string, data?: unknown) => ipcRenderer.invoke(channel, data),
  on: (channel: string, callback: Listener) => ipcRenderer.on(channel, callback),
  getSessions: (): Promise<SessionInfo[]> => ipcRenderer.invoke('sessions:get'),
  createSession: (name: string): Promise<SessionInfo> => ipcRenderer.invoke('sessions:create', name),
  readSessionFiles: (name: string): Promise<SessionFiles> => ipcRenderer.invoke('sessions:readFiles', name),
  writeSessionFiles: (name: string, data: SessionFiles): Promise<void> =>
    ipcRenderer.invoke('sessions:writeFiles', name, data),
  listDownloadedVideos: (): Promise<DownloadedVideo[]> => ipcRenderer.invoke('sessions:listDownloads'),
  getConfig: (): Promise<Config> => ipcRenderer.invoke('config:get'),
  updateConfig: (partial: Partial<Config>): Promise<Config> => ipcRenderer.invoke('config:update', partial),
  chooseSessionsRoot: (): Promise<string | null> => ipcRenderer.invoke('dialog:choose-folder'),
  chooseFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:choose-file'),
  runPrompts: (sessionName: string): Promise<RunResult> =>
    ipcRenderer.invoke('automation:run-prompts', sessionName),
  runDownloads: (sessionName: string, maxVideos: number): Promise<RunResult> =>
    ipcRenderer.invoke('automation:run-downloads', sessionName, maxVideos),
  cancelAutomation: (sessionName: string): Promise<RunResult> =>
    ipcRenderer.invoke('automation:cancel', sessionName),
  downloader: {
    openDrafts: (sessionName: string): Promise<RunResult> => ipcRenderer.invoke('downloader:open-drafts', sessionName),
    scanDrafts: (sessionName: string): Promise<RunResult> => ipcRenderer.invoke('downloader:scan', sessionName),
    downloadAll: (sessionName: string): Promise<RunResult> => ipcRenderer.invoke('downloader:downloadAll', sessionName)
  },
  generateWatermarkFrames: (videoPath: string): Promise<WatermarkFramesResult> =>
    ipcRenderer.invoke('watermark:frames', videoPath),
  watermark: {
    detect: (videoPath: string, templatePath?: string): Promise<WatermarkDetectionResult> =>
      ipcRenderer.invoke('watermark:detect', videoPath, templatePath),
    listMasks: (): Promise<WatermarkMask[]> => ipcRenderer.invoke('watermark:masks:list'),
    saveMask: (mask: WatermarkMask): Promise<WatermarkMask[]> => ipcRenderer.invoke('watermark:masks:save', mask),
    removeMask: (id: string): Promise<WatermarkMask[]> => ipcRenderer.invoke('watermark:masks:remove', id),
    clean: (videoPaths: string[], maskId?: string): Promise<WatermarkCleanResult> =>
      ipcRenderer.invoke('watermark:clean', videoPaths, maskId)
  },
  telegramTest: (): Promise<{ ok: boolean; error?: string; details?: string }> =>
    ipcRenderer.invoke('telegram:test'),
  windowMinimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  windowMaximize: (): Promise<void> => ipcRenderer.invoke('window:maximize'),
  windowClose: (): Promise<void> => ipcRenderer.invoke('window:close'),
  isWindowMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
  chrome: {
    list: (): Promise<ChromeProfile[]> => ipcRenderer.invoke('chrome:list'),
    scan: (): Promise<ChromeProfile[]> => ipcRenderer.invoke('chrome:scan'),
    setActive: (name: string): Promise<ChromeProfile[]> => ipcRenderer.invoke('chrome:setActive', name),
    save: (profile: ChromeProfile): Promise<ChromeProfile[]> => ipcRenderer.invoke('chrome:save', profile),
    remove: (name: string): Promise<ChromeProfile[]> => ipcRenderer.invoke('chrome:remove', name)
  },
  files: {
    read: (sessionId: string): Promise<SessionFiles> => ipcRenderer.invoke('files:read', sessionId),
    save: (
      sessionId: string,
      data: SessionFiles
    ): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('files:save', sessionId, data)
  },
  pipeline: {
    run: (steps: PipelineStep[]): Promise<RunResult> => ipcRenderer.invoke('pipeline:run', steps),
    stop: (): Promise<RunResult> => ipcRenderer.invoke('pipeline:stop'),
    onProgress: (callback: (progress: PipelineProgress) => void): (() => void) => {
      const handler = (_event: IpcRendererEvent, payload: PipelineProgress) => callback(payload);
      ipcRenderer.on('pipeline:progress', handler);
      return () => ipcRenderer.removeListener('pipeline:progress', handler);
    }
  },
  sessions: {
    list: (): Promise<ManagedSession[]> => ipcRenderer.invoke('sessions:registry:list'),
    save: (session: ManagedSession): Promise<ManagedSession[]> => ipcRenderer.invoke('sessions:registry:save', session),
    remove: (id: string): Promise<ManagedSession[]> => ipcRenderer.invoke('sessions:registry:remove', id),
    runPrompts: (id: string): Promise<RunResult> => ipcRenderer.invoke('sessions:runPrompts', id),
    runDownloads: (id: string): Promise<RunResult> => ipcRenderer.invoke('sessions:runDownloads', id),
    stop: (id: string): Promise<RunResult> => ipcRenderer.invoke('sessions:stop', id),
    command: (id: string, action: SessionCommandAction): Promise<RunResult> =>
      ipcRenderer.invoke('sessions:command', id, action),
    subscribeLogs: (id: string, cb: (entry: SessionLogEntry) => void): (() => void) => {
      const onLog = (_event: IpcRendererEvent, sessionId: string, entry: SessionLogEntry) => {
        if (sessionId === id) {
          cb(entry);
        }
      };

      const onInit = (_event: IpcRendererEvent, sessionId: string, entries: SessionLogEntry[]) => {
        if (sessionId === id) {
          entries.forEach(cb);
        }
      };

      ipcRenderer.on('sessions:log', onLog);
      ipcRenderer.on('sessions:logs:init', onInit);
      ipcRenderer.invoke('sessions:logs:subscribe', id);

      return () => {
        ipcRenderer.invoke('sessions:logs:unsubscribe', id);
        ipcRenderer.removeListener('sessions:log', onLog);
        ipcRenderer.removeListener('sessions:logs:init', onInit);
      };
    }
  }
};

declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
