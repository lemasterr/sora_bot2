import { SessionRecord, SessionStatus } from "./types";

export const listSessions = async (): Promise<SessionRecord[]> => {
  throw new Error("Not implemented");
};

export const saveSession = async (_session: SessionRecord): Promise<void> => {
  throw new Error("Not implemented");
};

export const getSession = async (_id: string): Promise<SessionRecord | null> => {
  throw new Error("Not implemented");
};

export const removeSession = async (_id: string): Promise<void> => {
  throw new Error("Not implemented");
};

export const getSessionStatus = async (_id: string): Promise<SessionStatus | null> => {
  throw new Error("Not implemented");
};

export const setSessionStatus = async (_status: SessionStatus): Promise<void> => {
  throw new Error("Not implemented");
};
