import { ChromeProfileConfig } from "../config/config";

export interface ChromeProfileEntry extends ChromeProfileConfig {
  isActive?: boolean;
}

export const scanProfiles = async (): Promise<ChromeProfileEntry[]> => {
  throw new Error("Not implemented");
};

export const listProfiles = async (): Promise<ChromeProfileEntry[]> => {
  throw new Error("Not implemented");
};

export const saveProfile = async (_profile: ChromeProfileEntry): Promise<void> => {
  throw new Error("Not implemented");
};

export const setActiveProfile = async (_name: string): Promise<void> => {
  throw new Error("Not implemented");
};

export const removeProfile = async (_name: string): Promise<void> => {
  throw new Error("Not implemented");
};
