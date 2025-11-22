import { ReactNode } from 'react';
import { AppPage } from '../store';

export interface NavItem {
  key: AppPage;
  label: string;
  icon: ReactNode;
}

interface SidebarProps {
  items: NavItem[];
  currentPage: AppPage;
  collapsed: boolean;
  onNavigate: (page: AppPage) => void;
  onToggleCollapse: () => void;
}

export function Sidebar({ items, currentPage, collapsed, onNavigate, onToggleCollapse }: SidebarProps) {
  return (
    <aside
      className={`relative flex h-full flex-col border-r border-[#27272a] bg-[#0e0e11] transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      <div className="flex items-center gap-2 px-4 py-4 text-sm font-semibold text-white">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/20 text-lg text-blue-400">
          ⚡
        </div>
        {!collapsed && (
          <div>
            <div className="text-xs uppercase tracking-widest text-zinc-400">Sora Lab</div>
            <div className="text-base">Automation</div>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-2">
        {items.map((item) => {
          const active = currentPage === item.key;
          return (
            <button
              key={item.key}
              title={collapsed ? item.label : undefined}
              onClick={() => onNavigate(item.key)}
              className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                active
                  ? 'bg-zinc-800 text-white border-l-2 border-blue-500'
                  : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-white'
              } ${collapsed ? 'justify-center px-2' : 'pl-4'}`}
            >
              <span className="text-lg">{item.icon}</span>
              {!collapsed && <span className="font-medium">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-[#27272a] px-2 py-3">
        <button
          onClick={onToggleCollapse}
          className="flex w-full items-center justify-center rounded-lg border border-[#27272a] bg-[#18181b] px-3 py-2 text-xs text-zinc-300 transition hover:border-blue-500 hover:text-white"
        >
          {collapsed ? '›' : '‹'} Collapse
        </button>
      </div>
    </aside>
  );
}
