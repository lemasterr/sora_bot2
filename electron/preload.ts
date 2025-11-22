import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type { Config, SessionFiles, SessionInfo } from '../shared/types';

type Listener = (event: IpcRendererEvent, data: unknown) => void;

const electronAPI = {
  invoke: (channel: string, data?: unknown) => ipcRenderer.invoke(channel, data),
  on: (channel: string, callback: Listener) => ipcRenderer.on(channel, callback),
  getSessions: (): Promise<SessionInfo[]> => ipcRenderer.invoke('sessions:get'),
  createSession: (name: string): Promise<SessionInfo> => ipcRenderer.invoke('sessions:create', name),
  readSessionFiles: (name: string): Promise<SessionFiles> => ipcRenderer.invoke('sessions:readFiles', name),
  writeSessionFiles: (name: string, data: SessionFiles): Promise<void> =>
    ipcRenderer.invoke('sessions:writeFiles', name, data),
  getConfig: (): Promise<Config> => ipcRenderer.invoke('config:get'),
  updateConfig: (partial: Partial<Config>): Promise<Config> => ipcRenderer.invoke('config:update', partial)
};

declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
