import { exec as execCb } from 'child_process';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

import { getConfig, getUserDataPath } from '../config/config';

const exec = promisify(execCb);

async function ensureFfmpeg(): Promise<void> {
  const config = await getConfig();
  if (config.ffmpegPath) {
    ffmpeg.setFfmpegPath(config.ffmpegPath);
    return;
  }

  try {
    await exec('ffmpeg -version');
  } catch {
    throw new Error('ffmpeg is not configured and not available in PATH');
  }
}

export async function extractPreviewFrames(videoPath: string, count: number): Promise<string[]> {
  await ensureFfmpeg();
  const tempRoot = path.join(getUserDataPath(), 'temp');
  await fs.mkdir(tempRoot, { recursive: true });
  const frameDir = await fs.mkdtemp(path.join(tempRoot, 'frames-'));

  await new Promise<void>((resolve, reject) => {
    ffmpeg(videoPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .screenshots({ count, folder: frameDir, filename: 'frame-%i.png' });
  });

  const files = await fs.readdir(frameDir);
  const framePaths = files
    .filter((f) => f.toLowerCase().endsWith('.png'))
    .sort()
    .map((f) => path.join(frameDir, f));

  return framePaths;
}

export async function cleanWatermarkBatch(inputDir: string, outputDir: string): Promise<void> {
  await ensureFfmpeg();
  await fs.mkdir(outputDir, { recursive: true });
  const entries = await fs.readdir(inputDir);

  const copies = entries
    .filter((file) => file.toLowerCase().endsWith('.mp4'))
    .map((file) => fs.copyFile(path.join(inputDir, file), path.join(outputDir, file)));

  await Promise.all(copies);
}
