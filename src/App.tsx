import { useEffect, useMemo } from 'react';
import { useAppStore, AppPage } from './store';

const navItems: { key: AppPage; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊' },
  { key: 'sessions', label: 'Sessions', icon: '🖥️' },
  { key: 'content', label: 'Content', icon: '📂' },
  { key: 'automator', label: 'Automator', icon: '🤖' },
  { key: 'watermark', label: 'Watermark', icon: '💧' },
  { key: 'telegram', label: 'Telegram', icon: '📨' },
  { key: 'settings', label: 'Settings', icon: '⚙️' }
];

const pageCopy: Record<AppPage, { title: string; description: string }> = {
  dashboard: {
    title: 'Dashboard',
    description: 'Quick stats and shortcuts for your workflows.'
  },
  sessions: {
    title: 'Sessions',
    description: 'Manage active sessions, environments, and processes.'
  },
  content: {
    title: 'Content',
    description: 'Organize prompts, templates, and other assets.'
  },
  automator: {
    title: 'Automator',
    description: 'Build and monitor automation pipelines.'
  },
  watermark: {
    title: 'Watermark Cleaner',
    description: 'Configure detection and clean-up routines.'
  },
  telegram: {
    title: 'Telegram',
    description: 'Connect and send notifications to Telegram chats.'
  },
  settings: {
    title: 'Settings',
    description: 'System-wide configuration and preferences.'
  }
};

function TopBar({ title, description }: { title: string; description: string }) {
  return (
    <header className="flex flex-col gap-1 border-b border-slate-800 bg-slate-900/50 p-4 shadow">
      <div className="text-sm uppercase tracking-widest text-slate-400">Control Center</div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">{title}</h1>
          <p className="text-sm text-slate-400">{description}</p>
        </div>
        <div className="rounded-lg bg-emerald-600/20 px-3 py-1 text-sm text-emerald-200 ring-1 ring-emerald-700/50">
          Online
        </div>
      </div>
    </header>
  );
}

function Sidebar({ currentPage, onNavigate }: { currentPage: AppPage; onNavigate: (page: AppPage) => void }) {
  return (
    <aside className="flex h-screen w-64 flex-col border-r border-slate-800 bg-slate-950/80 backdrop-blur">
      <div className="flex items-center gap-2 px-4 py-5 text-lg font-semibold tracking-tight text-white">
        <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-sky-500 p-2 text-center text-xl">⚡</span>
        Sora Desktop
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {navItems.map((item) => {
          const active = currentPage === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-slate-800/70
 ${
                active ? 'bg-slate-800 text-white ring-1 ring-emerald-600/60' : 'text-slate-300'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="border-t border-slate-800 px-4 py-4 text-xs text-slate-500">v0.1.0 · Electron + React</div>
    </aside>
  );
}

function Placeholder({ page }: { page: AppPage }) {
  const copy = useMemo(() => pageCopy[page], [page]);
  return (
    <div className="flex h-full flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-inner">
      <div>
        <h2 className="text-xl font-semibold text-white">{copy.title}</h2>
        <p className="text-sm text-slate-400">{copy.description}</p>
      </div>
      <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-700/80 bg-slate-950/70 p-10 text-center text-slate-500">
        Future tools and widgets for the {copy.title.toLowerCase()} will appear here.
      </div>
    </div>
  );
}

function App() {
  const { currentPage, setCurrentPage, loadInitialData } = useAppStore();
  const { title, description } = pageCopy[currentPage];

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <div className="flex flex-1 flex-col">
        <TopBar title={title} description={description} />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Placeholder page={currentPage} />
            <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/40 p-6">
              <h3 className="text-lg font-semibold text-white">Activity</h3>
              <p className="text-sm text-slate-400">
                This is a starter shell for your desktop application. Hook up data sources, IPC calls, and live components
                as you implement business logic.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-emerald-600/20 px-3 py-1 text-xs text-emerald-200 ring-1 ring-emerald-700/50">
                  Electron
                </span>
                <span className="rounded-full bg-sky-600/20 px-3 py-1 text-xs text-sky-200 ring-1 ring-sky-700/50">React 19</span>
                <span className="rounded-full bg-indigo-600/20 px-3 py-1 text-xs text-indigo-200 ring-1 ring-indigo-700/50">Vite</span>
                <span className="rounded-full bg-cyan-600/20 px-3 py-1 text-xs text-cyan-200 ring-1 ring-cyan-700/50">Tailwind</span>
                <span className="rounded-full bg-amber-600/20 px-3 py-1 text-xs text-amber-200 ring-1 ring-amber-700/50">Zustand</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
