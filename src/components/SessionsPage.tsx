import React, { useEffect, useMemo, useState } from 'react';
import type { ManagedSession, ChromeProfile, RunResult } from '../shared/types';
import { SessionWindow } from './SessionWindow';

const statusColors: Record<NonNullable<ManagedSession['status']>, string> = {
  idle: 'bg-zinc-700',
  running: 'bg-emerald-500',
  warning: 'bg-amber-400',
  error: 'bg-rose-500'
};

const emptySession: ManagedSession = {
  id: '',
  name: 'New Session',
  chromeProfile: undefined,
  promptProfile: undefined,
  cdpPort: 9222,
  promptsFile: '',
  imagePromptsFile: '',
  titlesFile: '',
  submittedLog: '',
  failedLog: '',
  downloadDir: '',
  cleanDir: '',
  cursorFile: '',
  maxVideos: 5,
  openDrafts: false,
  autoLaunchChrome: true,
  autoLaunchAutogen: false,
  notes: '',
  status: 'idle'
};

export const SessionsPage: React.FC = () => {
  const [sessions, setSessions] = useState<ManagedSession[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [form, setForm] = useState<ManagedSession>(emptySession);
  const [profiles, setProfiles] = useState<ChromeProfile[]>([]);
  const [saving, setSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState<string>('');
  const [openWindowId, setOpenWindowId] = useState<string | null>(null);

  const selectedSession = useMemo(() => sessions.find((s) => s.id === selectedId), [sessions, selectedId]);
  const openSession = useMemo(() => sessions.find((s) => s.id === openWindowId) || null, [sessions, openWindowId]);

  const loadSessions = async () => {
    if (!window.electronAPI?.sessions) return;
    const list = await window.electronAPI.sessions.list();
    setSessions(list);
    const first = list[0];
    if (first) {
      setSelectedId(first.id);
      setForm(first);
    }
  };

  const loadProfiles = async () => {
    const chromeApi = window.electronAPI?.chrome;
    if (!chromeApi) return;

    const result = (await chromeApi.listProfiles?.()) ?? (await chromeApi.scanProfiles?.());
    if (Array.isArray(result)) {
      setProfiles(result);
    } else if (result && typeof result === 'object') {
      if ('ok' in result && (result as any).ok && Array.isArray((result as any).profiles)) {
        setProfiles((result as any).profiles as ChromeProfile[]);
      } else if (Array.isArray((result as any).profiles)) {
        setProfiles((result as any).profiles as ChromeProfile[]);
      }
    }
  };

  useEffect(() => {
    loadSessions();
    loadProfiles();
  }, []);

  const handleSelect = (session: ManagedSession) => {
    setSelectedId(session.id);
    setForm(session);
    setActionMessage('');
  };

  const handleChange = <K extends keyof ManagedSession>(key: K, value: ManagedSession[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handlePick = async (key: keyof ManagedSession, type: 'file' | 'folder') => {
    const picker = type === 'file' ? window.electronAPI.chooseFile : window.electronAPI.chooseSessionsRoot;
    const value = await picker();
    if (value) {
      handleChange(key, value as ManagedSession[typeof key]);
    }
  };

  const saveSession = async () => {
    if (!window.electronAPI.sessions) return;
    setSaving(true);
    const updated = await window.electronAPI.sessions.save(form);
    setSessions(updated);
    const current = updated.find((s) => s.id === form.id) || updated[updated.length - 1];
    if (current) {
      setSelectedId(current.id);
      setForm(current);
    }
    setSaving(false);
    setActionMessage('Session saved');
  };

  const newSession = () => {
    setSelectedId('');
    setForm({ ...emptySession, name: 'New Session' });
    setActionMessage('');
  };

  const handleAction = async (action: 'prompts' | 'downloads' | 'stop' | 'open') => {
    if (!form.id || !window.electronAPI.sessions) return;
    if (action === 'open') {
      setOpenWindowId(form.id);
      setActionMessage('Session window opened');
      return;
    }

    const autogen = window.electronAPI.autogen;
    const downloader = window.electronAPI.downloader;
    let result: RunResult | undefined;

    if (action === 'prompts') {
      result = (await autogen?.run?.(form.id)) as RunResult;
      if (!result && window.electronAPI.sessions.runPrompts) {
        result = await window.electronAPI.sessions.runPrompts(form.id);
      }
    } else if (action === 'downloads') {
      result = (await downloader?.run?.(form.id, { limit: form.maxVideos ?? 0 })) as RunResult;
      if (!result && window.electronAPI.sessions.runDownloads) {
        result = await window.electronAPI.sessions.runDownloads(form.id, form.maxVideos);
      }
    } else {
      result = (await autogen?.stop?.(form.id)) as RunResult;
      await downloader?.stop?.(form.id);
      if (!result && window.electronAPI.sessions.cancelPrompts) {
        result = await window.electronAPI.sessions.cancelPrompts(form.id);
      }
    }

    if (!result) {
      setActionMessage('No response received');
      return;
    }

    const message = result.ok ? result.details ?? 'OK' : result.error ?? 'Error';
    setActionMessage(message);
    loadSessions();
  };

  const statusDot = (status: NonNullable<ManagedSession['status']>) => (
    <span className={`inline-block h-2.5 w-2.5 rounded-full ${statusColors[status] || statusColors.idle}`} />
  );

  return (
    <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-[280px,1fr]">
      <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/80">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="text-sm font-semibold text-zinc-100">Sessions</div>
          <button
            onClick={newSession}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
          >
            New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => handleSelect(session)}
              className={`w-full rounded-lg border px-3 py-2 text-left transition hover:border-blue-500 ${
                selectedId === session.id ? 'border-blue-500 bg-zinc-800 text-white' : 'border-zinc-800 bg-zinc-900 text-zinc-200'
              }`}
            >
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  {statusDot(session.status || 'idle')}
                  <span className="font-semibold">{session.name}</span>
                </div>
                <span className="text-xs text-zinc-400">{session.chromeProfile || 'No profile'}</span>
              </div>
              <div className="mt-1 text-xs text-zinc-400">{session.promptProfile || 'Prompt profile: default'}</div>
            </button>
          ))}
          {sessions.length === 0 && (
            <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/60 p-4 text-sm text-zinc-400">
              No sessions yet. Create one to begin.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div>
            <div className="text-lg font-semibold text-white">{form.name || 'Session Details'}</div>
            <div className="text-sm text-zinc-400">Configure automation paths and behavior per session.</div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleAction('open')}
              disabled={!form.id}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-200 hover:border-blue-500 hover:text-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Open Session Window
            </button>
            <button
              onClick={() => handleAction('prompts')}
              disabled={!form.id}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Run Prompts
            </button>
            <button
              onClick={() => handleAction('downloads')}
              disabled={!form.id}
              className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Run Downloads
            </button>
            <button
              onClick={() => handleAction('stop')}
              disabled={!form.id}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-200 hover:border-rose-400 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Stop Worker
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-sm text-zinc-300">
              Name
              <input
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
              />
            </label>

            <label className="block text-sm text-zinc-300">
              Chrome Profile
              <select
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                value={form.chromeProfile ?? ''}
                onChange={(e) => handleChange('chromeProfile', e.target.value || undefined)}
              >
                <option value="">Select profile</option>
                {profiles.map((profile) => (
                  <option key={profile.name} value={profile.name}>
                    {profile.name} ({profile.profileDirectory ?? profile.profileDir})
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm text-zinc-300">
              Prompt Profile
              <input
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                value={form.promptProfile || ''}
                onChange={(e) => handleChange('promptProfile', e.target.value)}
                placeholder="Profile name"
              />
            </label>

            <label className="block text-sm text-zinc-300">
              CDP Port
              <input
                type="number"
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                value={form.cdpPort ?? ''}
                onChange={(e) => handleChange('cdpPort', Number(e.target.value))}
              />
            </label>

            <div className="grid grid-cols-[1fr,auto] items-center gap-2">
              <label className="text-sm text-zinc-300">
                Prompts File
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                  value={form.promptsFile || ''}
                  onChange={(e) => handleChange('promptsFile', e.target.value)}
                />
              </label>
              <button
                className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:border-blue-500"
                onClick={() => handlePick('promptsFile', 'file')}
              >
                Browse
              </button>
            </div>

            <div className="grid grid-cols-[1fr,auto] items-center gap-2">
              <label className="text-sm text-zinc-300">
                Image Prompts File
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                  value={form.imagePromptsFile || ''}
                  onChange={(e) => handleChange('imagePromptsFile', e.target.value)}
                />
              </label>
              <button
                className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:border-blue-500"
                onClick={() => handlePick('imagePromptsFile', 'file')}
              >
                Browse
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-[1fr,auto] items-center gap-2">
              <label className="text-sm text-zinc-300">
                Titles File
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                  value={form.titlesFile || ''}
                  onChange={(e) => handleChange('titlesFile', e.target.value)}
                />
              </label>
              <button
                className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:border-blue-500"
                onClick={() => handlePick('titlesFile', 'file')}
              >
                Browse
              </button>
            </div>

            <div className="grid grid-cols-[1fr,auto] items-center gap-2">
              <label className="text-sm text-zinc-300">
                Download Directory
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                  value={form.downloadDir || ''}
                  onChange={(e) => handleChange('downloadDir', e.target.value)}
                />
              </label>
              <button
                className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:border-blue-500"
                onClick={() => handlePick('downloadDir', 'folder')}
              >
                Browse
              </button>
            </div>

            <div className="grid grid-cols-[1fr,auto] items-center gap-2">
              <label className="text-sm text-zinc-300">
                Clean Directory
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                  value={form.cleanDir || ''}
                  onChange={(e) => handleChange('cleanDir', e.target.value)}
                />
              </label>
              <button
                className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:border-blue-500"
                onClick={() => handlePick('cleanDir', 'folder')}
              >
                Browse
              </button>
            </div>

            <div className="grid grid-cols-[1fr,auto] items-center gap-2">
              <label className="text-sm text-zinc-300">
                Cursor File
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                  value={form.cursorFile || ''}
                  onChange={(e) => handleChange('cursorFile', e.target.value)}
                />
              </label>
              <button
                className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:border-blue-500"
                onClick={() => handlePick('cursorFile', 'file')}
              >
                Browse
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-zinc-300">
                Max Videos
                <input
                  type="number"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                  value={form.maxVideos ?? ''}
                  onChange={(e) => handleChange('maxVideos', Number(e.target.value))}
                />
              </label>
              <label className="block text-sm text-zinc-300">
                Submitted Log
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                  value={form.submittedLog || ''}
                  onChange={(e) => handleChange('submittedLog', e.target.value)}
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-zinc-300">
                Failed Log
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                  value={form.failedLog || ''}
                  onChange={(e) => handleChange('failedLog', e.target.value)}
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={form.openDrafts ?? false}
                  onChange={(e) => handleChange('openDrafts', e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500"
                />
                Open Drafts automatically
              </label>
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-zinc-300">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.autoLaunchChrome ?? false}
                  onChange={(e) => handleChange('autoLaunchChrome', e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500"
                />
                Auto-launch Chrome
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.autoLaunchAutogen ?? false}
                  onChange={(e) => handleChange('autoLaunchAutogen', e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500"
                />
                Auto-launch Autogen
              </label>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm text-zinc-300">
            Notes
            <textarea
              rows={3}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              value={form.notes || ''}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Workflow notes or reminders"
            />
          </label>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-zinc-400">{actionMessage}</div>
          <button
            onClick={saveSession}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Session'}
          </button>
        </div>
      </div>
      {openSession && <SessionWindow session={openSession} onClose={() => setOpenWindowId(null)} />}
    </div>
  );
};
