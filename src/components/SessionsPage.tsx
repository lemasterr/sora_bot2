import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import type { RunResult, SessionInfo } from '../shared/types';

interface RunState {
  status: 'idle' | 'running' | 'success' | 'error';
  message?: string;
}

export const SessionsPage: React.FC = () => {
  const { sessions, setCurrentPage, setSelectedSessionName, refreshSessions } = useAppStore();
  const [runStates, setRunStates] = useState<Record<string, RunState>>({});
  const [maxVideos, setMaxVideos] = useState<Record<string, number>>({});

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  const updateRunState = (name: string, state: RunState) => {
    setRunStates((prev) => ({ ...prev, [name]: state }));
  };

  const handleRun = async (name: string, action: 'prompts' | 'downloads') => {
    updateRunState(name, { status: 'running', message: 'Running...' });
    let result: RunResult;
    try {
      if (action === 'prompts') {
        result = await window.electronAPI.runPrompts(name);
      } else {
        const max = maxVideos[name] ?? 1;
        result = await window.electronAPI.runDownloads(name, max);
      }
    } catch (error) {
      updateRunState(name, { status: 'error', message: (error as Error).message });
      return;
    }

    if (result.ok) {
      updateRunState(name, { status: 'success', message: result.details || 'Completed' });
      refreshSessions();
    } else {
      updateRunState(name, { status: 'error', message: result.error || 'Unknown error' });
    }
  };

  const handleEdit = (session: SessionInfo) => {
    setSelectedSessionName(session.name);
    setCurrentPage('content');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Sessions</h3>
        <button
          onClick={refreshSessions}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:border-emerald-600 hover:text-emerald-200"
        >
          Refresh
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {sessions.map((session) => {
          const state = runStates[session.name] || { status: 'idle' };
          return (
            <div key={session.name} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-inner">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm uppercase tracking-wide text-slate-400">{session.path}</div>
                  <div className="text-xl font-semibold text-white">{session.name}</div>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs ${
                    session.hasFiles ? 'bg-emerald-600/20 text-emerald-200' : 'bg-slate-700/50 text-slate-300'
                  }`}
                >
                  {session.hasFiles ? 'Ready' : 'Empty'}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-300">
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <div className="text-xs text-slate-500">Prompts</div>
                  <div className="text-lg font-semibold text-emerald-200">{session.promptCount}</div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <div className="text-xs text-slate-500">Titles</div>
                  <div className="text-lg font-semibold text-sky-200">{session.titleCount}</div>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                <button
                  onClick={() => handleRun(session.name, 'prompts')}
                  className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-emerald-500"
                >
                  Run Prompts
                </button>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={maxVideos[session.name] ?? 1}
                    onChange={(e) => setMaxVideos((prev) => ({ ...prev, [session.name]: Number(e.target.value) }))}
                    className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    onClick={() => handleRun(session.name, 'downloads')}
                    className="flex-1 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-sky-500"
                  >
                    Run Downloads
                  </button>
                </div>
                <button
                  onClick={() => handleEdit(session)}
                  className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-indigo-500 hover:text-indigo-200"
                >
                  Edit
                </button>
                <div className="text-xs text-slate-400">
                  Status: <span className="font-medium">{state.message || state.status}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {sessions.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-6 text-center text-slate-400">
          No sessions found. Configure a sessions root in Settings and add prompt files to begin.
        </div>
      )}
    </div>
  );
};
