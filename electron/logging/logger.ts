export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  context?: string;
}

export type LogListener = (entry: LogEntry) => void;

export const createLogger = (_context?: string): LogListener => {
  return () => {
    // Placeholder logger implementation
  };
};

export const setGlobalListener = (_listener: LogListener): void => {
  void _listener;
};
