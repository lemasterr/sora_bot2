import { create } from 'zustand';
import type { Config, SessionInfo } from '../shared/types';

export type AppPage =
  | 'dashboard'
  | 'sessions'
  | 'content'
  | 'automator'
  | 'watermark'
  | 'telegram'
  | 'settings';

interface AppState {
  currentPage: AppPage;
  sessions: SessionInfo[];
  selectedSessionName: string | null;
  config: Config | null;
  setCurrentPage: (page: AppPage) => void;
  setSessions: (sessions: SessionInfo[]) => void;
  setSelectedSessionName: (name: string | null) => void;
  setConfig: (config: Config | null) => void;
  loadInitialData: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  currentPage: 'dashboard',
  sessions: [],
  selectedSessionName: null,
  config: null,
  setCurrentPage: (page: AppPage) => set({ currentPage: page }),
  setSessions: (sessions: SessionInfo[]) => set({ sessions }),
  setSelectedSessionName: (name: string | null) => set({ selectedSessionName: name }),
  setConfig: (config: Config | null) => set({ config }),
  loadInitialData: async () => {
    if (!window.electronAPI) return;
    const [sessions, config] = await Promise.all([
      window.electronAPI.getSessions(),
      window.electronAPI.getConfig()
    ]);

    set({
      sessions,
      config,
      selectedSessionName: sessions.length > 0 ? sessions[0].name : null
    });
  }
}));
