import { useEffect } from 'react';
import { AutomatorPage } from './components/AutomatorPage';
import { ContentPage } from './components/ContentPage';
import { DashboardPage } from './components/DashboardPage';
import { SessionsPage } from './components/SessionsPage';
import { SettingsPage } from './components/SettingsPage';
import { TelegramPage } from './components/TelegramPage';
import { WatermarkPage } from './components/WatermarkPage';
import { useAppStore, AppPage } from './store';

const navItems: { key: AppPage; label: string; icon: string; description: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊', description: 'Overview' },
  { key: 'sessions', label: 'Sessions', icon: '🗂️', description: 'Manage workspaces' },
  { key: 'content', label: 'Content', icon: '📜', description: 'Edit files' },
  { key: 'automator', label: 'Automator', icon: '🤖', description: 'Pipelines' },
  { key: 'watermark', label: 'Watermark', icon: '💧', description: 'Check outputs' },
  { key: 'telegram', label: 'Telegram', icon: '📨', description: 'Notifications' },
  { key: 'settings', label: 'Settings', icon: '⚙️', description: 'Environment' }
];

const pageTitles: Record<AppPage, { title: string; description: string }> = {
  dashboard: { title: 'Dashboard', description: 'Quick overview of sessions and environment.' },
  sessions: { title: 'Sessions', description: 'Run prompt and download workflows per session.' },
  content: { title: 'Content Editor', description: 'Edit prompts, image prompts, and titles.' },
  automator: { title: 'Automator', description: 'Multi-session pipeline runner.' },
  watermark: { title: 'Watermark Check', description: 'Generate preview frames to inspect outputs.' },
  telegram: { title: 'Telegram', description: 'Configure bot tokens and notifications.' },
  settings: { title: 'Settings', description: 'Paths, executables, timings, and limits.' }
};

function Sidebar({ currentPage, onNavigate }: { currentPage: AppPage; onNavigate: (page: AppPage) => void }) {
  return (
    <aside className="flex h-screen w-64 flex-col border-r border-slate-800 bg-slate-950/90">
      <div className="flex items-center gap-3 px-5 py-5 text-lg font-semibold text-white">
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
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-slate-800/80 ${
                active ? 'bg-slate-800 text-white ring-1 ring-emerald-600/50' : 'text-slate-300'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <div className="flex flex-col">
                <span className="font-medium">{item.label}</span>
                <span className="text-xs text-slate-400">{item.description}</span>
              </div>
            </button>
          );
        })}
      </nav>
      <div className="border-t border-slate-800 px-4 py-4 text-xs text-slate-500">Electron · React · Tailwind</div>
    </aside>
  );
}

function TopBar({ title, description }: { title: string; description: string }) {
  return (
    <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/70 px-6 py-4">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Sora Automation</div>
        <h1 className="text-2xl font-semibold text-white">{title}</h1>
        <p className="text-sm text-slate-400">{description}</p>
      </div>
      <div className="rounded-full bg-emerald-600/20 px-3 py-1 text-xs text-emerald-200 ring-1 ring-emerald-700/60">
        Connected
      </div>
    </header>
  );
}

function PageView({ currentPage }: { currentPage: AppPage }) {
  switch (currentPage) {
    case 'dashboard':
      return <DashboardPage />;
    case 'sessions':
      return <SessionsPage />;
    case 'content':
      return <ContentPage />;
    case 'automator':
      return <AutomatorPage />;
    case 'watermark':
      return <WatermarkPage />;
    case 'telegram':
      return <TelegramPage />;
    case 'settings':
      return <SettingsPage />;
    default:
      return null;
  }
}

function App() {
  const { currentPage, setCurrentPage, loadInitialData } = useAppStore();
  const { title, description } = pageTitles[currentPage];

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <div className="flex flex-1 flex-col">
        <TopBar title={title} description={description} />
        <main className="flex-1 overflow-y-auto p-6">
          <PageView currentPage={currentPage} />
        </main>
      </div>
    </div>
  );
}

export default App;
