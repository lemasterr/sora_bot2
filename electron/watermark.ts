import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { WatermarkFramesResult } from '../shared/types';

const execFileAsync = promisify(execFile);

const ensureTempDir = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sora-watermark-'));
  return dir;
};

export const generateWatermarkFrames = async (
  videoPath: string,
  ffmpegPath: string
): Promise<WatermarkFramesResult> => {
  if (!videoPath) {
    throw new Error('Video path is required');
  }
  if (!ffmpegPath) {
    throw new Error('ffmpeg path is not configured');
  }

  const tempDir = await ensureTempDir();
  const outputPattern = path.join(tempDir, 'frame-%02d.png');

  await execFileAsync(ffmpegPath, [
    '-y',
    '-i',
    videoPath,
    '-vf',
    "select='not(mod(n,30))'",
    '-vframes',
    '5',
    outputPattern
  ]);

  const files = await fs.readdir(tempDir);
  const frames = files
    .filter((file) => file.endsWith('.png'))
    .sort()
    .map((file) => path.join(tempDir, file));

  return { frames, tempDir };
};
