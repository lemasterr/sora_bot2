export interface WatermarkFrameResult {
  frames: string[];
  template?: string;
}

export const generatePreviewFrames = async (_videoPath: string, _frameCount = 5): Promise<WatermarkFrameResult> => {
  throw new Error("Not implemented");
};

export const detectWatermarkZones = async (_templatePath: string, _frames: string[]): Promise<string[]> => {
  throw new Error("Not implemented");
};
