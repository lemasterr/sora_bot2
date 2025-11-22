export interface BlurMask {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const applyBlurMasks = async (_videoPath: string, _masks: BlurMask[]): Promise<string> => {
  throw new Error("Not implemented");
};
