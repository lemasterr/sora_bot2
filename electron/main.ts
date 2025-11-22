import path from "path";
import { BrowserWindow, IpcMain, app, ipcMain } from "electron";
import { Config, getConfig, updateConfig } from "./config/config";
import { scanChromeProfiles, setActiveChromeProfile } from "./chrome/profiles";
import { cancelDownloads, runDownloads } from "./automation/downloader";
import { cancelPrompts, runPrompts } from "./automation/promptsRunner";
import { PipelineStep, cancelPipeline, runPipeline } from "./automation/pipeline";
import { extractPreviewFrames, cleanWatermarkBatch } from "./video/ffmpegWatermark";
import { testTelegram, sendTelegramMessage } from "./integrations/telegram";
import { deleteSession, getSession, listSessions, saveSession } from "./sessions/repo";
import { loggerEvents } from "./logging/logger";
import { logInfo } from "./logging/logger";
import { exportHistory } from "./logging/history";
import { Session } from "./sessions/types";

export interface MainWindowContext {
  mainWindow: BrowserWindow | null;
}

const isPackaged = app.isPackaged;

const getPreloadPath = (): string =>
  isPackaged
    ? path.join(__dirname, "preload.js")
    : path.join(__dirname, "dev-preload.js");

const getRendererUrl = (): string => {
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:5173";
  }
  return `file://${path.join(__dirname, "../dist/index.html")}`;
};

export const createMainWindow = (ctx: MainWindowContext): BrowserWindow | null => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    frame: false,
    backgroundColor: "#0b0b0f",
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  ctx.mainWindow = mainWindow;

  const rendererUrl = getRendererUrl();
  void mainWindow.loadURL(rendererUrl);

  return mainWindow;
};

const forwardLogEvents = (ctx: MainWindowContext): void => {
  loggerEvents.on("log", (entry) => {
    const contents = ctx.mainWindow?.webContents;
    if (contents && !contents.isDestroyed()) {
      contents.send("logging:entry", entry);
    }
  });
};

export const registerIpcHandlers = (ipc: IpcMain, ctx: MainWindowContext): void => {
  ipc.handle("config:get", async () => getConfig());
  ipc.handle("config:update", async (_event, partial: Partial<Config>) => updateConfig(partial));

  ipc.handle("chrome:scanProfiles", async () => scanChromeProfiles());
  ipc.handle("chrome:setActiveProfile", async (_event, name: string) => setActiveChromeProfile(name));

  ipc.handle("sessions:list", async () => listSessions());
  ipc.handle("sessions:get", async (_event, id: string) => getSession(id));
  ipc.handle("sessions:save", async (_event, session: Session) => saveSession(session));
  ipc.handle("sessions:delete", async (_event, id: string) => deleteSession(id));

  ipc.handle("sessions:runPrompts", async (_event, id: string) => {
    const session = await getSession(id);
    if (!session) return { ok: false, error: "Session not found" };
    return runPrompts(session);
  });

  ipc.handle("sessions:cancelPrompts", async (_event, id: string) => cancelPrompts(id));

  ipc.handle("sessions:runDownloads", async (_event, id: string, maxVideos: number) => {
    const session = await getSession(id);
    if (!session) return { ok: false, error: "Session not found" };
    return runDownloads(session, maxVideos);
  });

  ipc.handle("sessions:cancelDownloads", async (_event, id: string) => cancelDownloads(id));

  ipc.handle("pipeline:run", async (_event, steps: PipelineStep[]) => {
    const contents = ctx.mainWindow?.webContents;
    await runPipeline(steps, (status) => {
      if (contents && !contents.isDestroyed()) {
        contents.send("pipeline:progress", status);
      }
    });
  });

  ipc.handle("pipeline:cancel", async () => cancelPipeline());

  ipc.handle("video:extractPreviewFrames", async (_event, videoPath: string, count: number) =>
    extractPreviewFrames(videoPath, count),
  );
  ipc.handle("video:cleanWatermarkBatch", async (_event, inputDir: string, outputDir: string) =>
    cleanWatermarkBatch(inputDir, outputDir),
  );

  ipc.handle("telegram:test", async () => testTelegram());
  ipc.handle("telegram:sendMessage", async (_event, text: string) => sendTelegramMessage(text));

  ipc.handle("logging:export", async () => exportHistory());
};

export const registerAppEvents = (): void => {
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(globalContext);
    }
  });
};

const globalContext: MainWindowContext = { mainWindow: null };

export const bootstrap = (): void => {
  app.whenReady().then(() => {
    const win = createMainWindow(globalContext);
    registerIpcHandlers(ipcMain, globalContext);
    forwardLogEvents(globalContext);
    void getConfig().then(() => logInfo("main", "Configuration loaded"));
    if (!win) return;
  });

  registerAppEvents();
};

bootstrap();

export default bootstrap;
