import { contextBridge, ipcRenderer } from "electron";

export interface ElectronAPI {
  invoke: <T = unknown>(channel: string, payload?: unknown) => Promise<T>;
  on: (channel: string, listener: (event: unknown, data: unknown) => void) => void;
}

export const apiBridge: ElectronAPI = {
  invoke: async (channel, payload) => {
    void channel;
    void payload;
    return Promise.resolve({} as unknown as never);
  },
  on: (channel, listener) => {
    void channel;
    void listener;
  },
};

export const exposePreloadApi = (): void => {
  void contextBridge;
  void ipcRenderer;
};

export default exposePreloadApi;
