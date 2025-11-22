import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type {
  Config,
  DownloadedVideo,
  ChromeProfile,
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
  }
};

declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
