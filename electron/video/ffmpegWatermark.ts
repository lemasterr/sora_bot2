import { app } from "electron";
import ffmpeg from "fluent-ffmpeg";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";

import { getConfig } from "../config/config";

const execFile = promisify(require("child_process").execFile);

const ensureFfmpegAvailable = async (): Promise<void> => {
  const { ffmpegPath } = await getConfig();

  if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
    await fs.access(ffmpegPath).catch(() => {
      throw new Error(`ffmpeg executable not found at configured path: ${ffmpegPath}`);
    });
    return;
  }

  try {
    await execFile("ffmpeg", ["-version"]);
  } catch {
    throw new Error("ffmpegPath is not set and ffmpeg was not found in PATH.");
  }
};

export const extractPreviewFrames = async (videoPath: string, count: number): Promise<string[]> => {
  await ensureFfmpegAvailable();

  const tempDir = path.join(app.getPath("userData"), "temp", `frames-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  return new Promise<string[]>((resolve, reject) => {
    ffmpeg(videoPath)
      .on("end", () => {
        const frames = Array.from({ length: count }, (_, idx) => path.join(tempDir, `frame-${idx + 1}.png`));
        resolve(frames);
      })
      .on("error", (error) => reject(error))
      .screenshots({
        count,
        folder: tempDir,
        filename: "frame-%i.png",
      });
  });
};

export const cleanWatermarkBatch = async (inputDir: string, outputDir: string): Promise<void> => {
  await ensureFfmpegAvailable();
  await fs.mkdir(outputDir, { recursive: true });

  const entries = await fs.readdir(inputDir, { withFileTypes: true });
  const mp4Files = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".mp4"));

  await Promise.all(
    mp4Files.map((file) => {
      const source = path.join(inputDir, file.name);
      const target = path.join(outputDir, file.name);
      return fs.copyFile(source, target);
    })
  );
};
