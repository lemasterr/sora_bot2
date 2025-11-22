import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import type { Config } from '../shared/types';

export const SettingsPage: React.FC = () => {
  const { config, refreshConfig, setConfig } = useAppStore();
  const [draft, setDraft] = useState<Config | null>(config);
  const [status, setStatus] = useState('');

  useEffect(() => {
    setDraft(config);
  }, [config]);

  const updateField = (key: keyof Config, value: string | number | boolean) => {
    if (!draft) return;
    setDraft({ ...draft, [key]: value } as Config);
  };

  const save = async () => {
    if (!draft) return;
    const updated = await window.electronAPI.updateConfig(draft);
    setConfig(updated);
    setStatus('Saved');
  };

  const browseSessions = async () => {
    const dir = await window.electronAPI.chooseSessionsRoot();
    if (dir) {
      updateField('sessionsRoot', dir);
    }
  };

  useEffect(() => {
    refreshConfig();
  }, [refreshConfig]);

  if (!draft) {
    return <div className="text-sm text-slate-400">Loading configuration…</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-white">Settings</h3>
        <p className="text-sm text-slate-400">Configure paths and operational limits.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h4 className="text-sm font-semibold text-white">Directories</h4>
          <div>
            <label className="text-xs text-slate-400">Sessions root</label>
            <div className="mt-1 flex gap-2">
              <input
                value={draft.sessionsRoot}
                onChange={(e) => updateField('sessionsRoot', e.target.value)}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
              <button
                onClick={browseSessions}
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-100 hover:border-emerald-500 hover:text-emerald-200"
              >
                Browse…
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h4 className="text-sm font-semibold text-white">Executables</h4>
          <div>
            <label className="text-xs text-slate-400">Chrome path</label>
            <input
              value={draft.chromeExecutablePath}
              onChange={(e) => updateField('chromeExecutablePath', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400">ffmpeg path</label>
            <input
              value={draft.ffmpegPath}
              onChange={(e) => updateField('ffmpegPath', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h4 className="text-sm font-semibold text-white">Timings (ms)</h4>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="text-xs text-slate-400">Prompt delay</label>
              <input
                type="number"
                value={draft.promptDelayMs}
                onChange={(e) => updateField('promptDelayMs', Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400">Draft timeout</label>
              <input
                type="number"
                value={draft.draftTimeoutMs}
                onChange={(e) => updateField('draftTimeoutMs', Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400">Download timeout</label>
              <input
                type="number"
                value={draft.downloadTimeoutMs}
                onChange={(e) => updateField('downloadTimeoutMs', Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h4 className="text-sm font-semibold text-white">Limits</h4>
          <div>
            <label className="text-xs text-slate-400">Max parallel sessions</label>
            <input
              type="number"
              value={draft.maxParallelSessions}
              onChange={(e) => updateField('maxParallelSessions', Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <button
        onClick={save}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-500"
      >
        Save Settings
      </button>
      {status && <div className="text-xs text-slate-400">{status}</div>}
    </div>
  );
};
