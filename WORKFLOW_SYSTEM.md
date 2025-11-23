# Workflow System

The workflow system orchestrates a small, ordered set of automation steps. It is built on top of the shared runner in `core/workflow/workflow.ts` and exposed to the app through the IPC pipeline channel.

## Standard steps

| ID                | Label                   | Depends on            | Purpose                                        |
| ----------------- | ----------------------- | --------------------- | ---------------------------------------------- |
| openSessions      | Open all sessions       | —                     | Launches Chrome for each configured session.   |
| downloadSession1  | Download (Session 1)    | openSessions          | Runs the downloader for the first session.     |
| downloadSession2  | Download (Session 2)    | openSessions          | Runs the downloader for the second session.    |
| blurVideos        | Blur videos             | downloadSession1/2    | Applies blur profiles to cleaned/blurred dirs. |
| mergeVideos       | Merge videos            | blurVideos            | Merges blurred videos into a single file.      |
| cleanMetadata     | Clean metadata          | mergeVideos           | Strips metadata from the clean directory.      |

The default list is exported as `DEFAULT_WORKFLOW_STEPS` from `shared/types.ts` for both renderer and main process usage.

## Runner

The runner accepts an ordered list of steps (enabled/disabled) and executes them sequentially, respecting `dependsOn`. Failures are logged but do not halt later steps; unmet dependencies mark a step as `skipped`.

Progress events are emitted via the `pipeline:progress` IPC channel with `WorkflowProgress` payloads. The renderer uses these events to render per-step statuses.

## UI

The Automator page exposes the standard steps with checkboxes and live status indicators. The Quick Access panel triggers the default set directly through the pipeline IPC API.
