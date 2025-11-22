import { app } from "electron";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { getConfig } from "../config/config";
import { Session, SessionPaths } from "./types";

const SESSIONS_FILENAME = "sessions.json";

const getSessionsFilePath = (): string => path.join(app.getPath("userData"), SESSIONS_FILENAME);

const readSessionsFile = async (): Promise<Session[]> => {
  const filePath = getSessionsFilePath();
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as Session[];
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify([], null, 2), "utf-8");
      return [];
    }
    throw error;
  }
};

const writeSessionsFile = async (sessions: Session[]): Promise<void> => {
  const filePath = getSessionsFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(sessions, null, 2), "utf-8");
};

export const ensureSessionsRoot = async (): Promise<string> => {
  const config = await getConfig();
  const rootPath = config.sessionsRoot;
  await fs.mkdir(rootPath, { recursive: true });
  return rootPath;
};

export const listSessions = async (): Promise<Session[]> => readSessionsFile();

export const getSession = async (id: string): Promise<Session | null> => {
  const sessions = await readSessionsFile();
  return sessions.find((session) => session.id === id) ?? null;
};

export const saveSession = async (session: Session): Promise<Session> => {
  const sessions = await readSessionsFile();
  const existingIndex = sessions.findIndex((s) => s.id === session.id);
  const withId: Session = session.id ? session : { ...session, id: randomUUID() };

  if (existingIndex >= 0) {
    sessions[existingIndex] = withId;
  } else {
    sessions.push(withId);
  }

  await writeSessionsFile(sessions);
  return withId;
};

export const deleteSession = async (id: string): Promise<void> => {
  const sessions = await readSessionsFile();
  const remaining = sessions.filter((session) => session.id !== id);
  await writeSessionsFile(remaining);
};

export const getSessionPaths = async (session: Session): Promise<SessionPaths> => {
  const root = await ensureSessionsRoot();
  const resolvePath = (target: string): string =>
    path.isAbsolute(target) ? target : path.join(root, target);

  return {
    promptsFile: resolvePath(session.promptsFile),
    imagePromptsFile: resolvePath(session.imagePromptsFile),
    titlesFile: resolvePath(session.titlesFile),
    submittedLog: resolvePath(session.submittedLog),
    failedLog: resolvePath(session.failedLog),
    downloadDir: resolvePath(session.downloadDir),
    cleanDir: resolvePath(session.cleanDir),
    cursorFile: resolvePath(session.cursorFile),
  };
};
