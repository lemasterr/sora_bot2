import { ReactNode, useMemo, useState } from 'react';
import { AppPage } from '../store';
import { Sidebar, NavItem } from './Sidebar';
import { TitleBar } from './TitleBar';

interface LayoutProps {
  currentPage: AppPage;
  onNavigate: (page: AppPage) => void;
  pageTitle: string;
  pageDescription?: string;
  children: ReactNode;
}

export function Layout({ currentPage, onNavigate, pageTitle, pageDescription, children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);

  const navItems: NavItem[] = useMemo(
    () => [
      { key: 'dashboard', label: 'Dashboard', icon: '📊' },
      { key: 'sessions', label: 'Sessions', icon: '🗂️' },
      { key: 'automator', label: 'Automator', icon: '🤖' },
      { key: 'content', label: 'Content', icon: '✍️' },
      { key: 'watermark', label: 'Watermark', icon: '💧' },
      { key: 'telegram', label: 'Telegram', icon: '📨' },
      { key: 'logs', label: 'Logs', icon: '📜' },
      { key: 'settings', label: 'Settings', icon: '⚙️' }
    ],
    []
  );

  return (
    <div className="flex h-screen flex-col bg-[#09090b] text-zinc-100">
      <TitleBar title={pageTitle} description={pageDescription} />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar
          items={navItems}
          currentPage={currentPage}
          collapsed={collapsed}
          onNavigate={onNavigate}
          onToggleCollapse={() => setCollapsed((c) => !c)}
        />
        <div className="flex min-w-0 flex-1 overflow-hidden bg-[#0d0d10]">
          <main className="flex h-full flex-col gap-4 overflow-y-auto bg-gradient-to-br from-blue-600/10 to-transparent p-6 animate-fade-in">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
