import { EventEmitter } from "events";

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  ts: string;
  level: LogLevel;
  source: string;
  msg: string;
}

export const loggerEvents = new EventEmitter();

const emit = (level: LogLevel, source: string, msg: string): void => {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    source,
    msg,
  };

  const formatted = `[${entry.ts}] [${entry.source}] ${entry.msg}`;
  if (level === "warn") {
    console.warn(formatted);
  } else if (level === "error") {
    console.error(formatted);
  } else {
    console.info(formatted);
  }

  loggerEvents.emit("log", entry);
};

export const logInfo = (source: string, msg: string): void => emit("info", source, msg);

export const logWarn = (source: string, msg: string): void => emit("warn", source, msg);

export const logError = (source: string, msg: string): void => emit("error", source, msg);
