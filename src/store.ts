import { create } from 'zustand';
import type { Config, SessionInfo } from '../shared/types';

export type AppPage =
  | 'dashboard'
  | 'sessions'
  | 'automator'
  | 'downloader'
  | 'content'
  | 'logs'
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
  refreshSessions: () => Promise<void>;
  refreshConfig: () => Promise<void>;
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
    const api = window.electronAPI;
    if (!api) return;

    const fetchSessions = api.sessions?.list ?? api.getSessions;
    const fetchConfig = api.config?.get ?? api.getConfig;
    if (!fetchSessions || !fetchConfig) return;

    const [sessions, config] = await Promise.all([
      fetchSessions(),
      fetchConfig(),
    ]);

    set({
      sessions,
      config,
      selectedSessionName: sessions.length > 0 ? sessions[0].name : null
    });
  },
  refreshSessions: async () => {
    const api = window.electronAPI;
    const fetchSessions = api?.sessions?.list ?? api?.getSessions;
    if (!fetchSessions) return;

    const sessions = await fetchSessions();
    set((state) => ({
      sessions,
      selectedSessionName: state.selectedSessionName ?? (sessions[0]?.name ?? null)
    }));
  },
  refreshConfig: async () => {
    const api = window.electronAPI;
    const fetchConfig = api?.config?.get ?? api?.getConfig;
    if (!fetchConfig) return;

    const config = await fetchConfig();
    set({ config: config ?? null });
  }
}));
