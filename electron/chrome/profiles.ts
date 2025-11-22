import { Config } from '../config/config';

export type ChromeProfile = {
  name: string;
  userDataDir: string;
  profileDir: string;
};

export async function scanChromeProfiles(): Promise<ChromeProfile[]> {
  // TODO: implement scanning of Chrome profiles
  throw new Error('Not implemented');
}

export async function setActiveChromeProfile(_name: string): Promise<void> {
  // TODO: persist active profile to config
  throw new Error('Not implemented');
}

export async function getActiveChromeProfile(): Promise<ChromeProfile | null> {
  // TODO: fetch active profile from config/cache
  throw new Error('Not implemented');
}

export function applyConfig(_config: Config): void {
  // placeholder to demonstrate config dependency
}
