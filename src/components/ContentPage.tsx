import React, { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store';
import type { SessionFiles } from '../shared/types';

const textareaClass =
  'w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-sm text-slate-100 focus:border-emerald-500 focus:outline-none min-h-[140px]';

export const ContentPage: React.FC = () => {
  const { sessions, selectedSessionName, setSelectedSessionName, refreshSessions } = useAppStore();
  const [files, setFiles] = useState<SessionFiles>({ prompts: [], imagePrompts: [], titles: [] });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const sessionOptions = useMemo(
    () => sessions.map((s) => ({ value: s.name, label: s.name })),
    [sessions]
  );

  useEffect(() => {
    if (!selectedSessionName && sessions.length > 0) {
      setSelectedSessionName(sessions[0].name);
    }
  }, [sessions, selectedSessionName, setSelectedSessionName]);

  useEffect(() => {
    const loadFiles = async () => {
      if (!selectedSessionName) return;
      setLoading(true);
      try {
        const data = await window.electronAPI.readSessionFiles(selectedSessionName);
        setFiles(data);
      } finally {
        setLoading(false);
      }
    };
    loadFiles();
  }, [selectedSessionName]);

  const lineCounts = {
    prompts: files.prompts.length,
    imagePrompts: files.imagePrompts.length,
    titles: files.titles.length
  };

  const mismatch =
    lineCounts.prompts !== lineCounts.titles || lineCounts.imagePrompts > lineCounts.prompts;

  const handleSave = async () => {
    if (!selectedSessionName) return;
    setSaving(true);
    try {
      await window.electronAPI.writeSessionFiles(selectedSessionName, files);
      await refreshSessions();
    } finally {
      setSaving(false);
    }
  };

  const updateField = (key: keyof SessionFiles, value: string) => {
    setFiles((prev) => ({ ...prev, [key]: value.split(/\r?\n/) }));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Content Editor</h3>
          <p className="text-sm text-slate-400">Manage prompts, image prompts, and titles per session.</p>
        </div>
        <select
          value={selectedSessionName ?? ''}
          onChange={(e) => setSelectedSessionName(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none md:w-64"
        >
          <option value="">Select session</option>
          {sessionOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {selectedSessionName ? (
        <div className="space-y-4">
          {loading && <div className="text-sm text-slate-400">Loading files…</div>}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Prompts ({lineCounts.prompts})</span>
                <span>One per line</span>
              </div>
              <textarea
                value={files.prompts.join('\n')}
                onChange={(e) => updateField('prompts', e.target.value)}
                className={textareaClass}
                placeholder="Enter prompts here..."
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Image Prompts ({lineCounts.imagePrompts})</span>
                <span>Optional, one per line</span>
              </div>
              <textarea
                value={files.imagePrompts.join('\n')}
                onChange={(e) => updateField('imagePrompts', e.target.value)}
                className={textareaClass}
                placeholder="/path/to/image.png"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Titles ({lineCounts.titles})</span>
                <span>One per line</span>
              </div>
              <textarea
                value={files.titles.join('\n')}
                onChange={(e) => updateField('titles', e.target.value)}
                className={textareaClass}
                placeholder="Video title"
              />
            </div>
          </div>
          {mismatch && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              Warning: Prompts and titles counts differ. Image prompts should not exceed prompt count.
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-6 text-center text-slate-400">
          Select a session to edit its content.
        </div>
      )}
    </div>
  );
};
