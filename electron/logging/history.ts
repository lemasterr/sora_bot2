import { LogEntry, LogListener } from "./logger";

export const subscribe = (_listener: LogListener): void => {
  void _listener;
};

export const unsubscribe = (_listener: LogListener): void => {
  void _listener;
};

export const exportHistory = async (_filePath: string, _entries: LogEntry[]): Promise<void> => {
  throw new Error("Not implemented");
};
