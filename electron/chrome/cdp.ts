import puppeteer, { Browser } from "puppeteer-core";
import { getConfig } from "../config/config";
import { ChromeProfile } from "./profiles";

export const launchBrowserForSession = async (
  profile: ChromeProfile,
  cdpPort: number,
): Promise<Browser> => {
  const config = await getConfig();
  if (!config.chromeExecutablePath) {
    throw new Error("Chrome executable path is not configured");
  }

  return puppeteer.launch({
    executablePath: config.chromeExecutablePath,
    headless: false,
    userDataDir: profile.userDataDir,
    args: [
      `--profile-directory=${profile.profileDir}`,
      `--remote-debugging-port=${cdpPort}`,
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });
};

export const connectToBrowser = async (endpoint: string): Promise<{ browser: Browser }> => {
  const browser = await puppeteer.connect({ browserURL: endpoint });
  return { browser };
};

export const disconnect = async (connection: { browser: Browser }): Promise<void> => {
  try {
    await connection.browser.disconnect();
  } catch (error) {
    // Ignore disconnect errors to keep shutdown resilient
    console.warn("Failed to disconnect browser", error);
  }
};
