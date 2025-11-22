import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import type { ChromeProfile, Config } from '../shared/types';

const DEFAULT_CONFIG: Config = {
  sessionsRoot: '',
  chromeExecutablePath: '',
  chromeUserDataDir: '',
  ffmpegPath: '',
  promptDelayMs: 1500,
  draftTimeoutMs: 30000,
  downloadTimeoutMs: 60000,
  maxParallelSessions: 1,
  activeChromeProfile: '',
};

export const SettingsPage: React.FC = () => {
  const { config, refreshConfig, setConfig } = useAppStore();
  const [draft, setDraft] = useState<Config | null>(config ?? DEFAULT_CONFIG);
  const [status, setStatus] = useState('');
  const [testStatus, setTestStatus] = useState('');
  const [profiles, setProfiles] = useState<ChromeProfile[]>([]);
  const [editingProfile, setEditingProfile] = useState<ChromeProfile | null>(null);

  useEffect(() => {
    const normalized = config
      ? {
          ...DEFAULT_CONFIG,
          ...config,
          activeChromeProfile:
            (config as any).activeChromeProfile ?? (config as any).chromeActiveProfileName ?? (config as any).chromeActiveProfile,
        }
      : DEFAULT_CONFIG;
    setDraft(normalized);
    if ((normalized as any)?.chromeProfiles) {
      setProfiles((normalized as any).chromeProfiles);
    }
  }, [config]);

  const updateField = (key: keyof Config, value: string | number | boolean) => {
    if (!draft) return;
    setDraft({ ...draft, [key]: value } as Config);
  };

  const save = async () => {
    if (!draft) return;
    const configApi = window.electronAPI?.config ?? null;
    const update = configApi?.update ?? window.electronAPI?.updateConfig;
    if (!update) {
      setStatus('Config API unavailable');
      return;
    }
    const payload: any = {
      ...draft,
      chromeActiveProfileName: (draft as any).activeChromeProfile ?? null,
    };
    const updated = await update(payload);
    setConfig(updated as any);
    setStatus('Saved');
  };

  const browseSessions = async () => {
    const dir = await (window.electronAPI?.config as any)?.chooseSessionsRoot?.();
    if (dir) {
      updateField('sessionsRoot', dir);
    }
  };

  const loadProfiles = async () => {
    const list = (await window.electronAPI?.chrome?.list?.()) ?? (await window.electronAPI?.chrome?.scanProfiles?.());
    if (list) setProfiles(list);
  };

  const scanProfiles = async () => {
    const list = (await window.electronAPI?.chrome?.scan?.()) ?? (await window.electronAPI?.chrome?.scanProfiles?.());
    setProfiles(list);
    setStatus('Chrome profiles scanned');
    refreshConfig();
  };

  const setActiveProfile = async (name: string) => {
    const list =
      (await window.electronAPI?.chrome?.setActive?.(name)) ?? (await window.electronAPI?.chrome?.setActiveProfile?.(name));
    if (list) setProfiles(list);
    refreshConfig();
  };

  const saveProfile = async (profile: ChromeProfile) => {
    const list =
      (await window.electronAPI?.chrome?.save?.(profile)) ??
      (await window.electronAPI?.chrome?.setActiveProfile?.(profile.name));
    if (list) setProfiles(list);
    setEditingProfile(null);
    refreshConfig();
  };

  const removeProfile = async (name: string) => {
    const list = (await window.electronAPI?.chrome?.remove?.(name)) ?? (await window.electronAPI?.chrome?.scanProfiles?.());
    if (list) setProfiles(list);
    refreshConfig();
  };

  const sendTestMessage = async () => {
    if (!window.electronAPI?.telegramTest && !window.electronAPI?.telegram?.test) return;
    setTestStatus('Sending...');
    const result = (await window.electronAPI?.telegram?.test?.()) ?? (await window.electronAPI?.telegramTest?.());
    if (result.ok) {
      setTestStatus('Test message sent');
    } else {
      setTestStatus(`Error: ${result.error ?? 'Failed to send'}`);
    }
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
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-white">Settings</h3>
        <p className="text-sm text-slate-400">Configure paths, automation timings, and integration tokens.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-white">Chrome</h4>
              <p className="text-xs text-zinc-400">Executable, user data dir, and active profile.</p>
            </div>
            <button
              onClick={scanProfiles}
              className="rounded-lg border border-blue-500/60 bg-blue-500/20 px-3 py-2 text-xs font-semibold text-blue-100 transition hover:bg-blue-500/30"
            >
              Scan Profiles
            </button>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-zinc-400">Chrome executable</label>
            <input
              value={draft.chromeExecutablePath}
              onChange={(e) => updateField('chromeExecutablePath', e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
              placeholder="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-zinc-400">user-data-dir</label>
            <input
              value={draft.chromeUserDataDir ?? ''}
              onChange={(e) => updateField('chromeUserDataDir', e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
              placeholder="~/Library/Application Support/Google/Chrome"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-zinc-400">Active profile</label>
            <select
              value={draft.activeChromeProfile ?? ''}
              onChange={(e) => setActiveProfile(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
            >
              <option value="">Select profile</option>
              {profiles.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
          <h4 className="text-sm font-semibold text-white">Sessions</h4>
          <p className="text-xs text-zinc-400">Root directory and cleanup options.</p>
          <div className="space-y-2">
            <label className="text-xs text-zinc-400">Sessions root directory</label>
            <div className="mt-1 flex gap-2">
              <input
                value={draft.sessionsRoot}
                onChange={(e) => updateField('sessionsRoot', e.target.value)}
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={browseSessions}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-100 hover:border-blue-500 hover:text-blue-100"
              >
                Browse…
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-2 text-xs text-zinc-200">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.autoCleanupDownloads ?? false}
                onChange={(e) => updateField('autoCleanupDownloads', e.target.checked)}
                className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-blue-500 focus:ring-blue-500"
              />
              Auto-clean old downloads
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.autoCleanupProfiles ?? false}
                onChange={(e) => updateField('autoCleanupProfiles', e.target.checked)}
                className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-blue-500 focus:ring-blue-500"
              />
              Auto-clean unused profiles
            </label>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
          <h4 className="text-sm font-semibold text-white">FFmpeg</h4>
          <p className="text-xs text-zinc-400">Binary path and encoding defaults.</p>
          <div className="space-y-2">
            <label className="text-xs text-zinc-400">ffmpeg binary</label>
            <input
              value={draft.ffmpegPath}
              onChange={(e) => updateField('ffmpegPath', e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">vcodec</label>
              <input
                value={draft.ffmpegVcodec ?? ''}
                onChange={(e) => updateField('ffmpegVcodec', e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">crf</label>
              <input
                type="number"
                value={draft.ffmpegCrf ?? 0}
                onChange={(e) => updateField('ffmpegCrf', Number(e.target.value))}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">preset</label>
              <input
                value={draft.ffmpegPreset ?? ''}
                onChange={(e) => updateField('ffmpegPreset', e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
          <h4 className="text-sm font-semibold text-white">Watermark Cleaner</h4>
          <p className="text-xs text-zinc-400">Template matching and frame extraction defaults.</p>
          <div className="space-y-2">
            <label className="text-xs text-zinc-400">Template path</label>
            <input
              value={draft.watermarkTemplatePath ?? ''}
              onChange={(e) => updateField('watermarkTemplatePath', e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
              placeholder="/path/to/template.png"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">Confidence</label>
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={draft.watermarkConfidence ?? 0}
                onChange={(e) => updateField('watermarkConfidence', Number(e.target.value))}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">Frames</label>
              <input
                type="number"
                value={draft.watermarkFrames ?? 0}
                onChange={(e) => updateField('watermarkFrames', Number(e.target.value))}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">Downscale</label>
              <input
                type="number"
                value={draft.watermarkDownscale ?? 1}
                onChange={(e) => updateField('watermarkDownscale', Number(e.target.value))}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
          <h4 className="text-sm font-semibold text-white">Automator</h4>
          <p className="text-xs text-zinc-400">Default pacing and retry behavior.</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">Prompt delay (ms)</label>
              <input
                type="number"
                value={draft.promptDelayMs}
                onChange={(e) => updateField('promptDelayMs', Number(e.target.value))}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">Step delay (ms)</label>
              <input
                type="number"
                value={draft.automatorDelayMs ?? 0}
                onChange={(e) => updateField('automatorDelayMs', Number(e.target.value))}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">Retries</label>
              <input
                type="number"
                value={draft.automatorRetryCount ?? 0}
                onChange={(e) => updateField('automatorRetryCount', Number(e.target.value))}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">Draft timeout (ms)</label>
              <input
                type="number"
                value={draft.draftTimeoutMs}
                onChange={(e) => updateField('draftTimeoutMs', Number(e.target.value))}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">Download timeout (ms)</label>
              <input
                type="number"
                value={draft.downloadTimeoutMs}
                onChange={(e) => updateField('downloadTimeoutMs', Number(e.target.value))}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">Max parallel sessions</label>
              <input
                type="number"
                value={draft.maxParallelSessions}
                onChange={(e) => updateField('maxParallelSessions', Number(e.target.value))}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
          <h4 className="text-sm font-semibold text-white">Telegram</h4>
          <p className="text-xs text-zinc-400">Bot credentials and test trigger.</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">bot_token</label>
              <input
                value={draft.telegramBotToken ?? ''}
                onChange={(e) => updateField('telegramBotToken', e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">chat_id</label>
              <input
                value={draft.telegramChatId ?? ''}
                onChange={(e) => updateField('telegramChatId', e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2 text-xs text-zinc-200">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.autoSendDownloads ?? false}
                onChange={(e) => updateField('autoSendDownloads', e.target.checked)}
                className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-blue-500 focus:ring-blue-500"
              />
              Auto-send downloaded videos
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={sendTestMessage}
                className="rounded-lg border border-emerald-500/60 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/20"
              >
                Send test message
              </button>
              {testStatus && <span className="text-[11px] text-zinc-400">{testStatus}</span>}
            </div>
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

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-500"
        >
          Save Settings
        </button>
        {status && <div className="text-xs text-slate-400">{status}</div>}
      </div>
    </div>
  );
};
