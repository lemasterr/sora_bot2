import { create } from 'zustand';

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
  setCurrentPage: (page: AppPage) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentPage: 'dashboard',
  setCurrentPage: (page: AppPage) => set({ currentPage: page })
}));
