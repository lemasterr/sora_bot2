import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type {
  Config,
  DownloadedVideo,
  ChromeProfile,
  ManagedSession,
  RunResult,
  SessionFiles,
  SessionInfo,
  WatermarkFramesResult
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
  generateWatermarkFrames: (videoPath: string): Promise<WatermarkFramesResult> =>
    ipcRenderer.invoke('watermark:frames', videoPath),
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
  sessions: {
    list: (): Promise<ManagedSession[]> => ipcRenderer.invoke('sessions:registry:list'),
    save: (session: ManagedSession): Promise<ManagedSession[]> => ipcRenderer.invoke('sessions:registry:save', session),
    remove: (id: string): Promise<ManagedSession[]> => ipcRenderer.invoke('sessions:registry:remove', id),
    runPrompts: (id: string): Promise<RunResult> => ipcRenderer.invoke('sessions:runPrompts', id),
    runDownloads: (id: string): Promise<RunResult> => ipcRenderer.invoke('sessions:runDownloads', id),
    stop: (id: string): Promise<RunResult> => ipcRenderer.invoke('sessions:stop', id)
  }
};

declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
