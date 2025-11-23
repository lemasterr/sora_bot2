import React, { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store';
import type { PipelineProgress, PipelineStep, PipelineStepType } from '../shared/types';

type UiStep = PipelineStep & { id: string };

const STEP_TYPES: { value: PipelineStepType; label: string }[] = [
  { value: 'session_prompts', label: 'Session Prompts' },
  { value: 'session_images', label: 'Session Images' },
  { value: 'session_mix', label: 'Session Mix' },
  { value: 'session_download', label: 'Session Download' },
  { value: 'session_watermark', label: 'Session Watermark' },
  { value: 'session_chrome', label: 'Session Chrome' },
  { value: 'global_blur', label: 'Global Blur' },
  { value: 'global_merge', label: 'Global Merge' },
  { value: 'global_watermark', label: 'Global Watermark' },
  { value: 'global_probe', label: 'Global Probe' }
];

const createStep = (): UiStep => ({
  id: crypto.randomUUID(),
  type: 'session_prompts',
  sessionIds: [],
  limit: 0,
  group: ''
});

export const AutomatorPage: React.FC = () => {
  const { sessions } = useAppStore();
  const [steps, setSteps] = useState<UiStep[]>([createStep()]);
  const [logs, setLogs] = useState<PipelineProgress[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [warning, setWarning] = useState<string>('');

  const sessionOptions = useMemo(
    () =>
      sessions.map((s) => ({
        id: s.id,
        name: s.name,
        profileLabel: s.chromeProfileName ? `Chrome: ${s.chromeProfileName}` : 'Chrome: not set',
      })),
    [sessions]
  );
  const sessionNameById = useMemo(() => Object.fromEntries(sessionOptions.map((s) => [s.id, s.name])), [sessionOptions]);
  const statusColor =
    status === 'running' ? 'bg-blue-500' : status === 'success' ? 'bg-emerald-500' : status === 'error' ? 'bg-red-500' : 'bg-zinc-700';

  useEffect(() => {
    if (!window.electronAPI?.pipeline?.onProgress) {
      setWarning('Pipeline IPC is unavailable in this build.');
      return;
    }
    const unsubscribe = window.electronAPI.pipeline.onProgress((progress) => {
      setLogs((prev) => [progress as PipelineProgress, ...prev].slice(0, 3));
      if (progress.stepType === 'pipeline') {
        if (progress.status === 'running') setStatus('running');
        if (progress.status === 'success') setStatus('success');
        if (progress.status === 'error') setStatus('error');
      }
    });

    return () => unsubscribe?.();
  }, []);

  const updateStep = (id: string, partial: Partial<UiStep>) => {
    setSteps((prev) => prev.map((step) => (step.id === id ? { ...step, ...partial } : step)));
  };

  const addStep = () => setSteps((prev) => [...prev, createStep()]);

  const removeStep = (id: string) => setSteps((prev) => prev.filter((step) => step.id !== id));

  const toggleSession = (id: string, sessionId: string) => {
    setSteps((prev) =>
      prev.map((step) => {
        if (step.id !== id) return step;
        const next = new Set(step.sessionIds ?? []);
        if (next.has(sessionId)) {
          next.delete(sessionId);
        } else {
          next.add(sessionId);
        }
        return { ...step, sessionIds: Array.from(next) };
      })
    );
  };

  const startPipeline = async () => {
    if (!window.electronAPI?.pipeline?.run) {
      setWarning('Pipeline run API not available.');
      return;
    }
    setStatus('running');
    const payload: PipelineStep[] = steps.map(({ id, ...rest }) => ({ ...rest }));
    const result = await window.electronAPI.pipeline.run(payload);
    if (!result.ok) {
      setStatus('error');
    }
  };

  const stopPipeline = async () => {
    if (!window.electronAPI?.pipeline?.cancel) return;
    await window.electronAPI.pipeline.cancel();
    setStatus('idle');
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Automator Pipeline Editor</h3>
            <p className="text-sm text-zinc-400">Define ordered automation steps across sessions.</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-300">
            <span className={`h-2 w-2 rounded-full ${statusColor}`} data-status={status} />
            <span className="capitalize">{status}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={addStep}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            Add Step
          </button>
          <button
            onClick={startPipeline}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            Start Pipeline
          </button>
          <button
            onClick={stopPipeline}
            className="rounded-lg border border-red-600 px-3 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-600/20"
          >
            Stop
          </button>
        </div>

        <div className="space-y-3">
          {steps.map((step, index) => (
            <div key={step.id} className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300">Step {index + 1}</div>
                  <select
                    value={step.type}
                    onChange={(e) => updateStep(step.id, { type: e.target.value as PipelineStepType })}
                    className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
                  >
                    {STEP_TYPES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => removeStep(step.id)}
                  className="text-xs text-red-400 transition hover:text-red-300"
                >
                  Remove Step
                </button>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs uppercase tracking-wide text-zinc-400">
                    <span>Sessions</span>
                    <span className="text-[11px] text-zinc-500">
                      {(step.sessionIds?.length ?? 0) > 0
                        ? `${step.sessionIds?.length ?? 0} selected`
                        : 'None selected'}
                    </span>
                  </div>

                  <div className="space-y-2 rounded-lg border border-zinc-700 bg-zinc-800/60 p-2">
                    {sessionOptions.length === 0 && (
                      <div className="text-sm text-zinc-400">No sessions available.</div>
                    )}

                    {sessionOptions.map((session) => {
                      const checked = step.sessionIds?.includes(session.id);
                      return (
                        <label
                          key={session.id}
                          className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition ${
                            checked
                              ? 'border-emerald-500/60 bg-emerald-500/5 text-white'
                              : 'border-zinc-700 bg-zinc-900/30 text-zinc-200 hover:border-blue-500'
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="text-sm font-semibold">{session.name}</div>
                            <div className="text-xs text-zinc-400">{session.profileLabel}</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSession(step.id, session.id)}
                            className="h-4 w-4 accent-emerald-500"
                          />
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-xs text-zinc-500">Toggle the sessions that should run for this step.</p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {step.type === 'session_download' && (
                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-wide text-zinc-400">Max Downloads</label>
                      <input
                        type="number"
                        min={0}
                        value={step.limit ?? 0}
                        onChange={(e) => updateStep(step.id, { limit: Number(e.target.value) })}
                        className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
                      />
                      <p className="text-[11px] text-zinc-500">0 = без ограничения. Перекрывает лимит сессии.</p>
                    </div>
                  )}
                  {step.type === 'global_merge' && (
                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-wide text-zinc-400">Group</label>
                      <input
                        type="text"
                        value={step.group ?? ''}
                        onChange={(e) => updateStep(step.id, { group: e.target.value })}
                        className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
                        placeholder="merge group"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-zinc-700 bg-zinc-900 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-white">Active Logs</h4>
            <p className="text-xs text-zinc-500">Latest pipeline events</p>
          </div>
        </div>
        {warning && (
          <div className="rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">{warning}</div>
        )}
        <div className="space-y-2 text-sm font-mono text-zinc-200">
          {logs.length === 0 && <div className="text-zinc-500">No events yet.</div>}
          {logs.map((log, idx) => (
            <div key={`${log.stepIndex}-${idx}`} className="rounded border border-zinc-800 bg-zinc-950/70 px-3 py-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>{log.stepIndex >= 0 ? `Step ${log.stepIndex + 1}` : 'Pipeline'}</span>
                <span className="capitalize">{log.status}</span>
              </div>
              <div className="text-blue-400">{log.stepType}</div>
              <div className="text-zinc-100">{log.message}</div>
              {log.session && (
                <div className="text-emerald-400">{sessionNameById[log.session] ?? log.session}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
