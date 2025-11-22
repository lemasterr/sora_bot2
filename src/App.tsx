import { useEffect } from 'react';
import { AutomatorPage } from './components/AutomatorPage';
import { ContentPage } from './components/ContentPage';
import { DashboardPage } from './components/DashboardPage';
import { LogsPage } from './components/LogsPage';
import { SessionsPage } from './components/SessionsPage';
import { SettingsPage } from './components/SettingsPage';
import { TelegramPage } from './components/TelegramPage';
import { WatermarkPage } from './components/WatermarkPage';
import { Layout } from './components/Layout';
import { DownloaderPage } from './components/DownloaderPage';
import { useAppStore, AppPage } from './store';

const pageTitles: Record<AppPage, { title: string; description: string }> = {
  dashboard: { title: 'Dashboard', description: 'Operational overview and quick stats.' },
  sessions: { title: 'Sessions', description: 'Manage per-profile workspaces and run flows.' },
  automator: { title: 'Automator', description: 'Run prompt generation and download pipelines.' },
  downloader: { title: 'Downloader', description: 'Scan drafts and download videos with titles.' },
  content: { title: 'Content Editor', description: 'Edit prompts, image prompts, and titles in one place.' },
  watermark: { title: 'Watermark Check', description: 'Generate preview frames to inspect outputs.' },
  logs: { title: 'Logs', description: 'Review automation logs and events.' },
  settings: { title: 'Settings', description: 'Paths, executables, timings, and limits.' },
  telegram: { title: 'Telegram', description: 'Configure bot tokens and notifications.' }
};

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
    case 'downloader':
      return <DownloaderPage />;
    case 'watermark':
      return <WatermarkPage />;
    case 'telegram':
      return <TelegramPage />;
    case 'settings':
      return <SettingsPage />;
    case 'logs':
      return <LogsPage />;
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
    <Layout
      currentPage={currentPage}
      onNavigate={setCurrentPage}
      pageTitle={title}
      pageDescription={description}
    >
      <PageView currentPage={currentPage} />
    </Layout>
  );
}

export default App;
