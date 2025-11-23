import React, { useEffect, useMemo, useState } from 'react';
import type { ChromeProfile, SessionFiles } from '../shared/types';

const panelClass =
  'rounded-2xl border border-zinc-800 bg-[#0f0f12] shadow-lg shadow-blue-500/5 transition-all';
const textareaClass =
  'w-full resize-none rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-3 font-mono text-sm text-zinc-100 focus:border-blue-500 focus:outline-none';

const lineCount = (value: string) => (value.length === 0 ? 0 : value.split(/\r?\n/).length);

const toArrays = (values: Record<'prompts' | 'images' | 'titles', string>): SessionFiles => ({
  prompts: values.prompts.length ? values.prompts.split(/\r?\n/) : [],
  imagePrompts: values.images.length ? values.images.split(/\r?\n/) : [],
  titles: values.titles.length ? values.titles.split(/\r?\n/) : []
});

const autoResize = (el: HTMLTextAreaElement) => {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
};

export const ContentPage: React.FC = () => {
  const [profiles, setProfiles] = useState<ChromeProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [values, setValues] = useState<Record<'prompts' | 'images' | 'titles', string>>({
    prompts: '',
    images: '',
    titles: ''
  });
  const [loading, setLoading] = useState(false);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const loadProfiles = async (forceScan?: boolean) => {
      setLoadingProfiles(true);
      setError(null);
      try {
        const config = await window.electronAPI.config.get();
        const profileResult = forceScan
          ? await window.electronAPI.chrome.scanProfiles()
          : await window.electronAPI.chrome.listProfiles();

        if (!profileResult?.ok) {
          throw new Error(profileResult?.error || 'Failed to load profiles');
        }

        const nextProfiles = (profileResult.profiles as ChromeProfile[]) ?? [];
        setProfiles(nextProfiles);

        const activeName = (config as any)?.chromeActiveProfileName ?? null;
        const fallback = nextProfiles[0]?.name ?? '';
        setSelectedProfile(activeName || fallback || '');
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoadingProfiles(false);
      }
    };
    loadProfiles();

    return () => {
      setProfiles([]);
    };
  }, []);

  useEffect(() => {
    const fetchFiles = async () => {
      if (!selectedProfile) return;
      setLoading(true);
      setError(null);
      setStatus(null);
      try {
        const response = await (window.electronAPI.sessionFiles?.read ?? window.electronAPI.files.read)(selectedProfile);
        if (!response?.ok) {
          throw new Error(response?.error || 'Failed to load files');
        }
        const files = response.files as SessionFiles;
        setValues({
          prompts: files.prompts.join('\n'),
          images: files.imagePrompts.join('\n'),
          titles: files.titles.join('\n')
        });
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    fetchFiles();
  }, [selectedProfile]);

  const counts = useMemo(
    () => ({
      prompts: lineCount(values.prompts),
      images: lineCount(values.images),
      titles: lineCount(values.titles)
    }),
    [values]
  );

  const mismatch = counts.prompts !== counts.titles || counts.images > counts.prompts;

  const handleChange = (key: 'prompts' | 'images' | 'titles', value: string, el?: HTMLTextAreaElement) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (el) autoResize(el);
  };

  const handleSave = async () => {
    if (!selectedProfile) return;
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      const payload = toArrays(values);
      const saveFn = window.electronAPI.sessionFiles?.save ?? window.electronAPI.files.save;
      const result = await saveFn(selectedProfile, payload);
      if (!result.ok) {
        setError(result.error || 'Failed to save files');
      } else {
        setStatus('Saved successfully');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const profileLabel = profiles.find((p) => p.name === selectedProfile)?.name ?? 'Unknown';

  const renderColumn = (
    key: 'prompts' | 'images' | 'titles',
    label: string,
    description: string,
    accent?: string
  ) => (
    <div className={`${panelClass} flex flex-col gap-3 p-4`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-400">{label}</div>
          <div className="text-[11px] text-zinc-500">{description}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold ${accent ?? 'text-blue-400'}`}>{counts[key]} lines</span>
          <button
            onClick={handleSave}
            disabled={saving || !selectedProfile}
            className="rounded-lg border border-blue-500/60 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-100 hover:bg-blue-500/20 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      <textarea
        value={values[key]}
        onChange={(e) => handleChange(key, e.target.value, e.target)}
        className={textareaClass}
        placeholder={label}
        rows={8}
      />
    </div>
  );

  return (
    <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-white">Content Editor</h3>
            <p className="text-sm text-zinc-400">Edit prompt, image, and title files for each Chrome profile.</p>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
            <select
              value={selectedProfile}
              onChange={(e) => setSelectedProfile(e.target.value)}
              className="w-full max-w-xs rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
            >
              {profiles.length === 0 && <option value="">No profiles found</option>}
              {profiles.map((profile) => (
                <option key={profile.name} value={profile.name}>
                  {profile.name}
                </option>
              ))}
            </select>
            <button
              onClick={async () => {
                setScanning(true);
                setError(null);
                try {
                  const result = await window.electronAPI.chrome.scanProfiles();
                  if (!result?.ok) throw new Error(result?.error || 'Scan failed');
                  const next = (result.profiles as ChromeProfile[]) ?? [];
                  setProfiles(next);
                  const nextActive = next.find((p) => p.isActive)?.name ?? selectedProfile;
                  const fallback = nextActive || next[0]?.name || '';
                  setSelectedProfile(next.some((p) => p.name === fallback) ? fallback : next[0]?.name ?? '');
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setScanning(false);
                }
              }}
              disabled={scanning}
              className="inline-flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 hover:border-blue-500 disabled:opacity-50"
            >
              {scanning ? 'Scanning…' : 'Rescan Profiles'}
            </button>
            <div className="text-xs text-zinc-400 md:text-right">Editing profile: {selectedProfile || 'None selected'}</div>
          </div>
        </div>

      {loadingProfiles && <div className="text-sm text-zinc-500">Loading profiles…</div>}
      {loading && <div className="text-sm text-zinc-500">Loading files…</div>}
      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</div>
      )}
      {status && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{status}</div>
      )}

      {selectedProfile ? (
        <>
          {mismatch && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              Line counts mismatch for {profileLabel}. Titles should match prompts; image prompts should not exceed prompts.
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {renderColumn('prompts', 'prompts.txt', 'One prompt per line', 'text-emerald-400')}
            {renderColumn('images', 'image_prompts.txt', 'Optional image path/URL per line', 'text-blue-400')}
            {renderColumn('titles', 'titles.txt', 'One title per line', 'text-purple-300')}
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/40 p-6 text-center text-zinc-400">
          Scan or configure a Chrome profile and select it to edit its content files.
        </div>
      )}
    </div>
  );
};
