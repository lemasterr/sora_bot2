import type { Browser } from 'puppeteer-core';
import { ChromeProfile } from './profiles';

export async function launchBrowserForSession(_profile: ChromeProfile, _cdpPort: number): Promise<Browser> {
  // TODO: launch Chrome via puppeteer-core
  throw new Error('Not implemented');
}
