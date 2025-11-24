import fs from 'fs';
import path from 'path';

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');

function ensureLogFile() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, '', { encoding: 'utf-8' });
  }
}

function writeLog(level: string, message: string) {
  ensureLogFile();
  const entry = `[${new Date().toISOString()}] [${level}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, entry, { encoding: 'utf-8' });

  // Mirror logs to stdout so renderer/devtools can observe activity without
  // tailing the file directly. This helps during automated runs and when
  // debugging workflows from the terminal.
  // eslint-disable-next-line no-console
  console.log(entry.trimEnd());
}

export function logInfo(message: string) {
  writeLog('INFO', message);
}

export function logError(message: string, error?: unknown) {
  const detail = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : error ? String(error) : '';
  writeLog('ERROR', detail ? `${message} | ${detail}` : message);
}

export function logStep(message: string) {
  writeLog('STEP', message);
}
