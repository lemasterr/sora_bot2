import React from 'react';
import { useAppStore } from '../store';

const statCard = (label: string, value: string | number, accent: string) => (
  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-inner">
    <div className="text-sm uppercase tracking-wide text-slate-400">{label}</div>
    <div className={`mt-2 text-3xl font-semibold ${accent}`}>{value}</div>
  </div>
);

export const DashboardPage: React.FC = () => {
  const { sessions, config } = useAppStore();
  const totalPrompts = sessions.reduce((sum, s) => sum + s.promptCount, 0);
  const totalTitles = sessions.reduce((sum, s) => sum + s.titleCount, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {statCard('Sessions', sessions.length, 'text-emerald-300')}
        {statCard('Prompts', totalPrompts, 'text-sky-300')}
        {statCard('Titles', totalTitles, 'text-indigo-300')}
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-inner">
        <h3 className="text-lg font-semibold text-white">Environment</h3>
        <div className="mt-3 grid gap-3 text-sm text-slate-300 md:grid-cols-2">
          <div>
            <div className="text-slate-400">Sessions root</div>
            <div className="truncate font-mono text-emerald-200">{config?.sessionsRoot ?? 'Not set'}</div>
          </div>
          <div>
            <div className="text-slate-400">Chrome executable</div>
            <div className="truncate font-mono text-sky-200">{config?.chromeExecutablePath || 'Not set'}</div>
          </div>
          <div>
            <div className="text-slate-400">ffmpeg path</div>
            <div className="truncate font-mono text-indigo-200">{config?.ffmpegPath || 'Not set'}</div>
          </div>
          <div>
            <div className="text-slate-400">Max parallel sessions</div>
            <div className="font-mono text-amber-200">{config?.maxParallelSessions ?? '-'}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
