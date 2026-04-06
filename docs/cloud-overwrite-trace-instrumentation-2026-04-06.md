# Cloud Overwrite Provenance Trace Instrumentation (2026-04-06)

## Purpose
Temporary DEV-only tracing to identify the exact runtime caller/path that triggers storyboard overwrite/revert during cloud sync transitions.

## In-app viewer (DEV only)
- When `STORYBOARD_REVERT_DETECTED` fires, the app now shows:
  - banner: **“Storyboard revert detected. Debug trace captured.”**
  - auto-open modal: **Cloud Debug Trace**
- Modal actions:
  - **Copy Trace**
  - **Clear Trace**
  - **Close**
- This removes the need to open DevTools just to access trace payloads.

## Trace buffer
- Global buffer key: `window.__SS_OVERWRITE_TRACE__`
- Latest head key: `window.__SS_TRACE_LATEST_HEAD__`
- Revert de-dup key: `window.__SS_TRACE_REVERT_SEEN__`

## Event names
- `OVERWRITE_PATH_ENTER`
- `OVERWRITE_PATH_EXIT`
- `LOAD_PROJECT_ENTER`
- `LOAD_PROJECT_EXIT`
- `SHOT_IMAGE_DIFF_BEFORE_APPLY`
- `SHOT_IMAGE_DIFF_AFTER_APPLY`
- `STORYBOARD_REVERT_DETECTED`

## Instrumented source labels
- `initial_cloud_load`
- `hydrate_project_snapshot`
- `incoming_cloud_snapshot`
- `pending_remote_snapshot`
- `head_alignment`
- `live_storyboard_subscription_apply`
- `live_storyboard_deferred_apply`
- `local_to_cloud_conversion`
- `other_load_project`
- `other_applyLiveStoryboardState`

## `loadProject` callers found
- `openProject` (local file open path)
- `openProjectFromPath` (local desktop path)
- `openRecentProject` (local browser snapshot reopen)
- `hydrateProjectSnapshot` (cloud snapshot hydration)
- `applyIncomingCloudSnapshot` (cloud incoming snapshot apply)

## Cloud-flow indirect paths to `loadProject`
- `CloudSyncCoordinator` latest head effect -> `applyIncomingCloudSnapshot` -> `loadProject`
- `CloudSyncCoordinator` pending snapshot effect -> `applyPendingRemoteSnapshot` -> `applyIncomingCloudSnapshot` -> `loadProject`
- `CloudSyncCoordinator` hydration trigger effect -> `hydrateProjectSnapshot` -> `loadProject`

## Overwrite paths without `loadProject`
- `applyLiveStoryboardState` replaces storyboard scenes/shots from live tables.
- `openCloudProject` replaces project skeleton state (metadata-first open).
- `createCloudProjectFromLocal` updates scene shot image/imageAsset payload during conversion.

## Dev console commands
Clear trace:
```js
window.__SS_OVERWRITE_TRACE__ = []
window.__SS_TRACE_REVERT_SEEN__ = new Set()
```

Dump full trace:
```js
window.__SS_OVERWRITE_TRACE__
```

Dump only overwrite/revert events:
```js
window.__SS_OVERWRITE_TRACE__.filter(e => [
  'OVERWRITE_PATH_ENTER',
  'OVERWRITE_PATH_EXIT',
  'LOAD_PROJECT_ENTER',
  'LOAD_PROJECT_EXIT',
  'STORYBOARD_REVERT_DETECTED',
].includes(e.event))
```

Find event immediately before revert:
```js
const t = window.__SS_OVERWRITE_TRACE__ || []
const i = t.findIndex(e => e.event === 'STORYBOARD_REVERT_DETECTED')
i > 0 ? t.slice(Math.max(0, i - 6), i + 1) : t.slice(-20)
```

## Notes
- Instrumentation is trace-only and DEV-focused.
- No permanent bug fix is implemented in this pass.
