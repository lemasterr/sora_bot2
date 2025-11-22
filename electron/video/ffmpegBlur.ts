import { exec as execCb } from 'child_process';
import ffmpeg, { FilterSpecification } from 'fluent-ffmpeg';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

import { getConfig } from '../config/config';

export type BlurZone = { x: number; y: number; w: number; h: number };

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

export async function blurVideo(input: string, output: string, zones: BlurZone[]): Promise<void> {
  await ensureFfmpeg();
  await fs.mkdir(path.dirname(output), { recursive: true });

  if (!zones.length) {
    await fs.copyFile(input, output);
    return;
  }

  const filters: FilterSpecification[] = [];
  let lastLabel: string | undefined = '0:v';

  zones.forEach((zone, idx) => {
    const cropLabel = `crop${idx}`;
    const blurLabel = `blur${idx}`;
    const overlayLabel = `ol${idx}`;

    filters.push({ filter: 'crop', options: `${zone.w}:${zone.h}:${zone.x}:${zone.y}`, inputs: lastLabel, outputs: cropLabel });
    filters.push({ filter: 'boxblur', options: '20:20', inputs: cropLabel, outputs: blurLabel });
    filters.push({ filter: 'overlay', options: `${zone.x}:${zone.y}`, inputs: [lastLabel, blurLabel], outputs: overlayLabel });

    lastLabel = overlayLabel;
  });

  const mapVideo = lastLabel ?? '0:v';

  await new Promise<void>((resolve, reject) => {
    ffmpeg(input)
      .complexFilter(filters)
      .outputOptions(['-map', mapVideo, '-map', '0:a?', '-c:a', 'copy'])
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .save(output);
  });
}
