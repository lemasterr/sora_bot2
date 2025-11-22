import { EventEmitter } from 'events';

export type LogEntry = {
  ts: string;
  level: 'info' | 'warn' | 'error';
  source: string;
  msg: string;
};

export const loggerEvents = new EventEmitter();

export function logInfo(_source: string, _msg: string): void {
  // TODO: emit info log
}

export function logWarn(_source: string, _msg: string): void {
  // TODO: emit warn log
}

export function logError(_source: string, _msg: string): void {
  // TODO: emit error log
}
