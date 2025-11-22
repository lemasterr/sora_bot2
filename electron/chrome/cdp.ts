import { Browser } from "puppeteer-core";

export interface CdpConnection {
  browser: Browser;
}

export const connectToBrowser = async (_endpoint: string): Promise<CdpConnection> => {
  throw new Error("Not implemented");
};

export const disconnect = async (_connection: CdpConnection): Promise<void> => {
  throw new Error("Not implemented");
};
