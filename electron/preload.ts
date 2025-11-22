import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

type Listener = (event: IpcRendererEvent, data: unknown) => void;

declare global {
  interface Window {
    electronAPI: {
      invoke: (channel: string, data?: unknown) => Promise<unknown>;
      on: (channel: string, callback: Listener) => void;
    };
  }
}

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, data?: unknown) => ipcRenderer.invoke(channel, data),
  on: (channel: string, callback: Listener) => ipcRenderer.on(channel, callback)
});
