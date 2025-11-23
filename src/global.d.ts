export {}; // ensure this file is treated as a module

declare global {
  interface Window {
    electronAPI?: Record<string, any>;
  }
}
