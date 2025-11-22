import { useEffect, useState } from 'react';

interface TitleBarProps {
  title: string;
  description?: string;
}

export function TitleBar({ title, description }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const checkState = async () => {
      if (window.electronAPI?.isWindowMaximized) {
        const state = await window.electronAPI.isWindowMaximized();
        setIsMaximized(Boolean(state));
      }
    };

    const handler = (_event: unknown, state: unknown) => setIsMaximized(Boolean(state));

    checkState();
    window.electronAPI?.on?.('window:maximized', handler);

    return () => {
      // ipcRenderer removeListener not exposed; relies on single mounting in app lifecycle
    };
  }, []);

  const handleMin = () => window.electronAPI?.windowMinimize?.();
  const handleMax = () => window.electronAPI?.windowMaximize?.();
  const handleClose = () => window.electronAPI?.windowClose?.();

  return (
    <header
      className="titlebar-drag flex h-12 items-center justify-between border-b border-[#27272a] bg-[#0b0b0f] px-3 text-sm text-zinc-300"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/15 text-blue-400">⚙️</div>
        <div className="flex flex-col leading-tight">
          <span className="text-xs uppercase tracking-[0.24em] text-zinc-500">Cyberpunk Lab</span>
          <span className="text-base text-white">{title}</span>
          {description && <span className="text-[11px] text-zinc-500">{description}</span>}
        </div>
      </div>

      <div className="titlebar-no-drag flex items-center gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-[#27272a] bg-[#111114] px-2 py-1">
          <div className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="text-[11px] text-zinc-400">Status: Connected</span>
        </div>
        <div className="ml-2 flex h-8 items-center gap-1">
          <button
            onClick={handleMin}
            className="titlebar-no-drag flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition hover:bg-[#18181b] hover:text-white"
            aria-label="Minimize"
          >
            –
          </button>
          <button
            onClick={handleMax}
            className="titlebar-no-drag flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition hover:bg-[#18181b] hover:text-white"
            aria-label="Maximize"
          >
            {isMaximized ? '❒' : '□'}
          </button>
          <button
            onClick={handleClose}
            className="titlebar-no-drag flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition hover:bg-red-600/80 hover:text-white"
            aria-label="Close"
          >
            ×
          </button>
        </div>
      </div>
    </header>
  );
}
