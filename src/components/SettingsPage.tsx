import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import type { ChromeProfile, Config } from '../shared/types';

export const SettingsPage: React.FC = () => {
  const { config, refreshConfig, setConfig } = useAppStore();
  const [draft, setDraft] = useState<Config | null>(config);
  const [status, setStatus] = useState('');
  const [profiles, setProfiles] = useState<ChromeProfile[]>([]);
  const [editingProfile, setEditingProfile] = useState<ChromeProfile | null>(null);

  useEffect(() => {
    setDraft(config);
    if (config?.chromeProfiles) {
      setProfiles(config.chromeProfiles);
    }
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

  const loadProfiles = async () => {
    if (!window.electronAPI?.chrome) return;
    const list = await window.electronAPI.chrome.list();
    setProfiles(list);
  };

  const scanProfiles = async () => {
    if (!window.electronAPI?.chrome) return;
    const list = await window.electronAPI.chrome.scan();
    setProfiles(list);
    setStatus('Chrome profiles scanned');
    refreshConfig();
  };

  const setActiveProfile = async (name: string) => {
    if (!window.electronAPI?.chrome) return;
    const list = await window.electronAPI.chrome.setActive(name);
    setProfiles(list);
    refreshConfig();
  };

  const saveProfile = async (profile: ChromeProfile) => {
    if (!window.electronAPI?.chrome) return;
    const list = await window.electronAPI.chrome.save(profile);
    setProfiles(list);
    setEditingProfile(null);
    refreshConfig();
  };

  const removeProfile = async (name: string) => {
    if (!window.electronAPI?.chrome) return;
    const list = await window.electronAPI.chrome.remove(name);
    setProfiles(list);
    refreshConfig();
  };

  const startEditProfile = (profile: ChromeProfile) => {
    setEditingProfile({ ...profile });
  };

  const startCreateProfile = () => {
    setEditingProfile({ name: 'Custom Profile', userDataDir: '', profileDir: '' });
  };

  useEffect(() => {
    refreshConfig();
    loadProfiles();
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

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 shadow-inner">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-white">Chrome Profiles</h4>
            <p className="text-xs text-zinc-400">Scan and manage Chrome user-data directories.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={scanProfiles}
              className="rounded-lg border border-blue-500/60 bg-blue-500/20 px-3 py-2 text-xs font-semibold text-blue-100 transition hover:bg-blue-500/30"
            >
              Scan Chrome Profiles
            </button>
            <button
              onClick={startCreateProfile}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:border-emerald-400/70 hover:text-emerald-200"
            >
              Add Custom
            </button>
          </div>
        </div>

        {editingProfile && (
          <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="text-xs text-zinc-400">Name</label>
                <input
                  value={editingProfile.name}
                  onChange={(e) => setEditingProfile({ ...editingProfile, name: e.target.value })}
                  className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400">User Data Dir</label>
                <input
                  value={editingProfile.userDataDir}
                  onChange={(e) => setEditingProfile({ ...editingProfile, userDataDir: e.target.value })}
                  className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400">Profile Dir</label>
                <input
                  value={editingProfile.profileDir}
                  onChange={(e) => setEditingProfile({ ...editingProfile, profileDir: e.target.value })}
                  className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => editingProfile && saveProfile(editingProfile)}
                className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500"
              >
                Save Entry
              </button>
              <button
                onClick={() => setEditingProfile(null)}
                className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-zinc-500"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {profiles.map((profile) => (
            <div key={profile.name} className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">{profile.name}</p>
                  {profile.isActive && (
                    <span className="mt-1 inline-flex rounded-full bg-emerald-500/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
                      Active
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setActiveProfile(profile.name)}
                  className="rounded-md border border-blue-500/60 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-100 hover:bg-blue-500/20"
                >
                  Set Active Profile
                </button>
              </div>
              <div className="mt-3 space-y-1 text-xs text-zinc-400">
                <div>
                  <span className="font-semibold text-zinc-300">user-data-dir:</span>
                  <div className="truncate text-[11px] text-zinc-400">{profile.userDataDir}</div>
                </div>
                <div>
                  <span className="font-semibold text-zinc-300">profile-directory:</span>
                  <div className="truncate text-[11px] text-zinc-400">{profile.profileDir}</div>
                </div>
              </div>
              <div className="mt-4 flex gap-2 text-xs">
                <button
                  onClick={() => startEditProfile(profile)}
                  className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 font-semibold text-zinc-200 transition hover:border-blue-500/60 hover:text-blue-100"
                >
                  Edit
                </button>
                <button
                  onClick={() => removeProfile(profile.name)}
                  className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-semibold text-red-200 transition hover:border-red-500 hover:bg-red-500/10"
                >
                  Delete Entry
                </button>
              </div>
            </div>
          ))}

          {profiles.length === 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
              No profiles stored yet. Scan to import existing Chrome profiles or add one manually.
            </div>
          )}
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
