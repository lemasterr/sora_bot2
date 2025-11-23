# Multi-session download manager

The multi-session manager coordinates sequential Chrome launches for multiple
profiles and runs the shared download flow for each one. It centralizes CDP
port validation, profile resolution, Chrome startup, and teardown.

## How it works
1. Validate that every session configuration has a unique `cdpPort`.
2. Resolve the profile path for `profileId` via the unified profile scanner.
3. Launch Chrome with the centralized launcher, then wait for CDP readiness.
4. Connect over CDP to allow the caller to prepare a page for automation.
5. Run the provided download flow with a configured max download count.
6. Close the Puppeteer connection and terminate the Chrome PID before moving
   to the next session.

## API
`runMultiSessionDownload(sessions, flows)` takes:
- `sessions`: array of `{ sessionId, profileId, cdpPort, maxDownloads }`.
- `flows.createPage(cdpPort)`: returns a prepared Puppeteer `Page` connected
  to the session’s Chrome instance on `cdpPort`.
- `flows.downloadFlow`: typically the shared `runDownloadLoop` from
  `core/download/downloadFlow`.
- `flows.downloadOptions`: base options for the download loop (selectors,
  download directory, swipe handler) excluding `page` and `maxDownloads`.

The function returns an array of `{ sessionId, profilePath, completed, result?,
error? }` per session.

## Notes
- Chrome is always launched through `launchChromeWithCDP`, so no other manual
  spawns should be used for multi-session runs.
- CDP connections are cleaned up even on errors, and the Chrome PID is killed
  after each session finishes.
- Adjust `downloadOptions` to point at the correct download directory and
  selectors for your environment before invoking the manager.
