import React, { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_WORKFLOW_STEPS,
  type WorkflowClientStep,
  type WorkflowProgress,
} from '../shared/types';
import { useAppStore } from '../store';

const STATUS_COLORS: Record<string, string> = {
  idle: 'bg-zinc-700',
  running: 'bg-blue-500',
  success: 'bg-emerald-500',
  error: 'bg-red-500',
  skipped: 'bg-amber-500',
};

export const AutomatorPage: React.FC = () => {
  const { sessions } = useAppStore();
  const [steps, setSteps] = useState<WorkflowClientStep[]>(DEFAULT_WORKFLOW_STEPS);
  const [logs, setLogs] = useState<WorkflowProgress[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [warning, setWarning] = useState<string>('');
  const [stepStatuses, setStepStatuses] = useState<Record<string, WorkflowProgress>>({});

  const workflowStatusColor = STATUS_COLORS[status] ?? STATUS_COLORS.idle;

  useEffect(() => {
    if (!window.electronAPI?.pipeline?.onProgress) {
      setWarning('Workflow IPC is unavailable in this build.');
      return;
    }
    const unsubscribe = window.electronAPI.pipeline.onProgress((progress) => {
      const event = progress as WorkflowProgress;
      setLogs((prev) => [event, ...prev].slice(0, 6));

      if (event.stepId === 'workflow') {
        if (event.status === 'running') setStatus('running');
        if (event.status === 'success') setStatus('success');
        if (event.status === 'error') setStatus('error');
      } else {
        setStepStatuses((prev) => ({ ...prev, [event.stepId]: event }));
      }
    });

    return () => unsubscribe?.();
  }, []);

  const toggleStep = (id: WorkflowClientStep['id']) => {
    setSteps((prev) => prev.map((step) => (step.id === id ? { ...step, enabled: !step.enabled } : step)));
  };

  const resetSteps = () => setSteps(DEFAULT_WORKFLOW_STEPS);

  const startWorkflow = async () => {
    if (!window.electronAPI?.pipeline?.run) {
      setWarning('Workflow run API not available.');
      return;
    }
    setStatus('running');
    setStepStatuses({});
    setLogs([]);
    const payload = steps.map((step) => ({ ...step }));
    await window.electronAPI.pipeline.run(payload);
  };

  const stopWorkflow = async () => {
    if (!window.electronAPI?.pipeline?.cancel) return;
    await window.electronAPI.pipeline.cancel();
    setStatus('idle');
  };

  const sessionNamesById = useMemo(
    () => Object.fromEntries(sessions.map((s) => [s.id, s.name])),
    [sessions]
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Workflow Runner</h3>
            <p className="text-sm text-zinc-400">Toggle and execute the standard automation steps.</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-300">
            <span className={`h-2 w-2 rounded-full ${workflowStatusColor}`} data-status={status} />
            <span className="capitalize">{status}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={startWorkflow}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            Start Workflow
          </button>
          <button
            onClick={stopWorkflow}
            className="rounded-lg border border-red-600 px-3 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-600/20"
          >
            Stop
          </button>
          <button
            onClick={resetSteps}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-200 transition hover:border-blue-500"
          >
            Reset to defaults
          </button>
        </div>

        <div className="space-y-3">
          {steps.map((step, index) => {
            const event = stepStatuses[step.id];
            const stepStatus = event?.status ?? 'idle';
            const color = STATUS_COLORS[stepStatus] ?? STATUS_COLORS.idle;
            return (
              <div key={step.id} className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300">Step {index + 1}</div>
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-white">{step.label}</div>
                      {step.dependsOn && step.dependsOn.length > 0 && (
                        <div className="text-[11px] text-zinc-400">Depends on: {step.dependsOn.join(', ')}</div>
                      )}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-zinc-200">
                    <input
                      type="checkbox"
                      checked={step.enabled}
                      onChange={() => toggleStep(step.id)}
                      className="h-4 w-4 accent-emerald-500"
                    />
                    Enable
                  </label>
                  <div className="flex items-center gap-2 text-xs text-zinc-200">
                    <span className={`h-2 w-2 rounded-full ${color}`} />
                    <span className="capitalize">{stepStatus}</span>
                  </div>
                </div>
                {event?.message && <div className="mt-2 text-xs text-zinc-300">{event.message}</div>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-zinc-700 bg-zinc-900 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-white">Active Logs</h4>
            <p className="text-xs text-zinc-500">Latest workflow events</p>
          </div>
        </div>
        {warning && (
          <div className="rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">{warning}</div>
        )}
        <div className="space-y-2 text-sm font-mono text-zinc-200">
          {logs.length === 0 && <div className="text-zinc-500">No events yet.</div>}
          {logs.map((log, idx) => (
            <div key={`${log.stepId}-${idx}`} className="rounded border border-zinc-800 bg-zinc-950/70 px-3 py-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="capitalize">{log.stepId}</span>
                <span className="capitalize">{log.status}</span>
              </div>
              <div className="text-zinc-100">{log.message}</div>
              {log.label && <div className="text-emerald-400">{log.label}</div>}
            </div>
          ))}
        </div>
        {Object.keys(sessionNamesById).length === 0 && (
          <div className="rounded-md border border-zinc-700 bg-zinc-800 p-3 text-xs text-zinc-200">
            Сессии не найдены. Создайте их на странице Sessions, чтобы шаги скачки и постобработки работали.
          </div>
        )}
      </div>
    </div>
  );
};
