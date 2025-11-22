import { app } from "electron";
import { promises as fs } from "fs";
import path from "path";

const MAX_HISTORY_BYTES = 10 * 1024 * 1024; // 10MB

export const getHistoryPath = (): string =>
  path.join(app.getPath("userData"), "history.jsonl");

const rotateIfNeeded = async (filePath: string, incomingBytes: number): Promise<void> => {
  try {
    const stats = await fs.stat(filePath);
    if (stats.size + incomingBytes <= MAX_HISTORY_BYTES) return;

    const rotated = `${filePath}.1`;
    await fs.rename(filePath, rotated).catch((error: any) => {
      if (error?.code !== "ENOENT") throw error;
    });
    await fs.writeFile(filePath, "", "utf-8");
  } catch (error: any) {
    if (error?.code !== "ENOENT") return;
    // File does not exist yet; nothing to rotate.
  }
};

export const appendHistory = async (record: any): Promise<void> => {
  const filePath = getHistoryPath();
  const dir = path.dirname(filePath);
  const line = `${JSON.stringify(record)}\n`;

  await fs.mkdir(dir, { recursive: true });
  await rotateIfNeeded(filePath, Buffer.byteLength(line, "utf-8"));
  await fs.appendFile(filePath, line, "utf-8");
};
