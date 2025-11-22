# Sora Desktop

A modern Electron + React desktop shell for Sora automation. It ships with session-aware Chrome profiles, prompt and download pipelines, watermark previews, and Telegram configuration in a dark admin UI.

## Features
- Electron main process with context-isolated preload bridge for safe IPC.
- React 19 + Vite renderer styled with Tailwind (dark admin theme).
- Session manager for per-profile prompt/title files, downloads, and logs.
- Puppeteer-based automation stubs for prompt submission and draft downloads.
- Watermark preview generation and Telegram test hooks via IPC.

## Prerequisites
- Node.js 18+ and npm.
- Google Chrome/Chromium (path configurable in settings).
- ffmpeg available if you plan to generate watermark preview frames.

## Quick start (auto-setup)
Use the provided helper script to install dependencies and start the dev environment (Vite + Electron):

```bash
./start.sh
```

The script will run `npm install` if needed and then `npm run dev`, which starts the Vite renderer on port 5173 and launches Electron pointing at it.

## Manual workflow
Install dependencies (first time):

```bash
npm install
```

Run the app in development (Vite + Electron with hot reload):

```bash
npm run dev
```

Build production assets:

```bash
npm run build
```

## Project structure
- `electron/` – main process, preload bridge, automation, config, and session management.
- `src/` – React renderer pages and Zustand store.
- `shared/` – shared TypeScript types between main and renderer.
- `tailwind.config.cjs`, `postcss.config.cjs` – styling pipeline.
- `tsconfig.json`, `tsconfig.electron.json` – TypeScript configs for renderer and Electron.

## Configuration
At runtime the app stores user configuration (session root, Chrome/ffmpeg paths, timing settings, Telegram tokens, etc.) in the Electron `userData` directory. Adjust paths and timings from the Settings page inside the app; updates persist to disk.

## Sessions and data
Each session lives under the configured sessions root:

```
<sessionsRoot>/<sessionName>/
  prompts.txt
  image_prompts.txt
  titles.txt
  submitted.log
  failed.log
  profile/
  downloads/
```

Use the Sessions and Content pages to edit files, run prompt submissions, and trigger draft downloads. Logs accumulate per session.

## Notes
- The automation flows assume you are signed into Sora in the selected Chrome profile.
- Puppeteer uses `chromeExecutablePath` from the Settings config; set it before running automation.
- Watermark previews rely on ffmpeg; if absent, the IPC call will fail gracefully.
