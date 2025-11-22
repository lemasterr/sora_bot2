import React, { useMemo, useState } from 'react';
import { useAppStore } from '../store';
import type { RunResult } from '../shared/types';

type PipelineStatus = {
  status: 'idle' | 'running' | 'success' | 'error';
  message?: string;
};

export const AutomatorPage: React.FC = () => {
  const { sessions } = useAppStore();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [maxVideos, setMaxVideos] = useState<Record<string, number>>({});
  const [doPrompts, setDoPrompts] = useState(true);
  const [doDownloads, setDoDownloads] = useState(true);
  const [statuses, setStatuses] = useState<Record<string, PipelineStatus>>({});

  const selectableSessions = useMemo(() => sessions.map((s) => s.name), [sessions]);

  const runForSession = async (name: string) => {
    setStatuses((prev) => ({ ...prev, [name]: { status: 'running', message: 'Starting...' } }));
    let lastResult: RunResult | null = null;

    try {
      if (doPrompts) {
        setStatuses((prev) => ({ ...prev, [name]: { status: 'running', message: 'Running prompts…' } }));
        lastResult = await window.electronAPI.runPrompts(name);
        if (!lastResult.ok) throw new Error(lastResult.error || 'Prompt run failed');
      }

      if (doDownloads) {
        setStatuses((prev) => ({ ...prev, [name]: { status: 'running', message: 'Downloading videos…' } }));
        const max = maxVideos[name] ?? 1;
        lastResult = await window.electronAPI.runDownloads(name, max);
        if (!lastResult.ok) throw new Error(lastResult.error || 'Download run failed');
      }

      setStatuses((prev) => ({ ...prev, [name]: { status: 'success', message: lastResult?.details || 'Done' } }));
    } catch (error) {
      setStatuses((prev) => ({
        ...prev,
        [name]: { status: 'error', message: (error as Error).message }
      }));
    }
  };

  const handlePipeline = async () => {
    const selectedSessions = selectableSessions.filter((name) => selected[name]);
    for (const name of selectedSessions) {
      // Run sequentially to avoid overwhelming resources
      // eslint-disable-next-line no-await-in-loop
      await runForSession(name);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Automation Pipeline</h3>
          <p className="text-sm text-slate-400">Run prompts and downloads across multiple sessions.</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-200">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={doPrompts} onChange={(e) => setDoPrompts(e.target.checked)} />
            Generate drafts
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={doDownloads} onChange={(e) => setDoDownloads(e.target.checked)} />
            Download videos
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {selectableSessions.map((name) => (
          <div key={name} className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <label className="flex items-center gap-3 text-sm text-slate-100">
              <input
                type="checkbox"
                checked={!!selected[name]}
                onChange={(e) => setSelected((prev) => ({ ...prev, [name]: e.target.checked }))}
              />
              {name}
            </label>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={maxVideos[name] ?? 1}
                onChange={(e) => setMaxVideos((prev) => ({ ...prev, [name]: Number(e.target.value) }))}
                className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
              <span className="text-xs text-slate-400">Max videos</span>
            </div>
            <div className="mt-2 text-xs text-slate-400">Status: {statuses[name]?.message || statuses[name]?.status || 'idle'}</div>
          </div>
        ))}
      </div>

      <button
        onClick={handlePipeline}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-500"
      >
        Run Pipeline
      </button>
    </div>
  );
};
