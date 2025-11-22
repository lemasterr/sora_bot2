import ffmpeg from "fluent-ffmpeg";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";

import { getConfig } from "../config/config";

const execFile = promisify(require("child_process").execFile);

export type BlurZone = { x: number; y: number; w: number; h: number };

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

export const blurVideo = async (input: string, output: string, zones: BlurZone[]): Promise<void> => {
  await ensureFfmpegAvailable();
  await fs.mkdir(path.dirname(output), { recursive: true });

  if (zones.length === 0) {
    await fs.copyFile(input, output);
    return;
  }

  const filters: string[] = [];
  let currentLabel = "0:v";

  zones.forEach((zone, index) => {
    const baseSplit = `base${index}_s`;
    const cropSrc = `crop${index}_src`;
    const cropLabel = `crop${index}`;
    const blurLabel = `blur${index}`;
    const nextBase = `base${index + 1}`;

    filters.push(`[${currentLabel}]split[${baseSplit}][${cropSrc}]`);
    filters.push(`[${cropSrc}]crop=${zone.w}:${zone.h}:${zone.x}:${zone.y}[${cropLabel}]`);
    filters.push(
      `[${cropLabel}]boxblur=luma_radius=20:luma_power=1:chroma_radius=20:chroma_power=1[${blurLabel}]`
    );
    filters.push(`[${baseSplit}][${blurLabel}]overlay=${zone.x}:${zone.y}[${nextBase}]`);

    currentLabel = nextBase;
  });

  await new Promise<void>((resolve, reject) => {
    ffmpeg(input)
      .complexFilter(filters, currentLabel)
      .outputOptions(["-map", `[${currentLabel}]`])
      .on("end", () => resolve())
      .on("error", (error) => reject(error))
      .save(output);
  });
};
