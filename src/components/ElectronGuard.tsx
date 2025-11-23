import React from 'react';

export const ElectronGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const hasElectron = typeof (window as any).electronAPI !== 'undefined' && (window as any).electronAPI !== null;

  if (!hasElectron) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-900 text-slate-100">
        <div className="max-w-lg rounded-2xl border border-slate-700 bg-slate-800/80 p-6 shadow-xl">
          <h1 className="mb-3 text-xl font-semibold">Electron backend is not available</h1>
          <p className="text-sm text-slate-300">
            This interface is designed to run inside the Sora desktop app (Electron). Please start it via the provided start
            script or packaged app, instead of opening the Vite dev URL directly in your browser.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
