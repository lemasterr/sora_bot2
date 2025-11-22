import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import type { DownloadedVideo, WatermarkFramesResult } from '../shared/types';

export const WatermarkPage: React.FC = () => {
  const { sessions } = useAppStore();
  const [videos, setVideos] = useState<DownloadedVideo[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [frames, setFrames] = useState<string[]>([]);
  const [status, setStatus] = useState<string>('');

  const loadVideos = async () => {
    const list = await window.electronAPI.listDownloadedVideos();
    setVideos(list);
    if (list.length > 0) setSelected(list[0].path);
  };

  useEffect(() => {
    loadVideos();
  }, []);

  const handleGenerate = async () => {
    if (!selected) return;
    setStatus('Generating frames…');
    try {
      const result: WatermarkFramesResult = await window.electronAPI.generateWatermarkFrames(selected);
      setFrames(result.frames);
      setStatus(`Generated ${result.frames.length} frame(s)`);
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Watermark Check</h3>
          <p className="text-sm text-slate-400">Pick a downloaded video and generate preview frames.</p>
        </div>
        <button
          onClick={loadVideos}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:border-emerald-600 hover:text-emerald-200"
        >
          Refresh list
        </button>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <label className="text-sm text-slate-300">Video</label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
        >
          {videos.length === 0 && <option value="">No downloads found</option>}
          {videos.map((v) => (
            <option key={v.path} value={v.path}>
              {v.sessionName ? `[${v.sessionName}] ` : ''}
              {v.fileName}
            </option>
          ))}
        </select>
        <button
          onClick={handleGenerate}
          disabled={!selected}
          className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500 disabled:opacity-50"
        >
          Generate Preview Frames
        </button>
        {status && <div className="mt-2 text-xs text-slate-400">{status}</div>}
      </div>

      {frames.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-white">Frames</h4>
          <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
            {frames.map((frame) => (
              <img key={frame} src={frame} alt="frame" className="rounded-lg border border-slate-800" />
            ))}
          </div>
        </div>
      )}

      {sessions.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-400">
          No sessions available. Configure in Settings.
        </div>
      )}
    </div>
  );
};
