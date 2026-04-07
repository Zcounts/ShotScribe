# Cloud Overwrite Provenance Trace Instrumentation (2026-04-06)

## Purpose
Temporary debug-enabled tracing to identify the exact runtime caller/path that triggers storyboard overwrite/revert during cloud sync transitions.

## In-app viewer (debug-enabled only)
- When `STORYBOARD_REVERT_DETECTED` fires, the app now shows:
  - banner: **“Storyboard revert detected. Debug trace captured.”**
  - auto-open modal: **Cloud Debug Trace**
- Modal actions:
  - **Copy Trace**
  - **Clear Trace**
  - **Close**
- This removes the need to open DevTools just to access trace payloads.

## Enabling cloud debug on deployed app
- Option A: open app with query param:
  - `https://app.shot-scribe.com/?ssCloudDebug=1`
- Option B: set localStorage once, then refresh:
  - `localStorage.setItem('ssCloudDebug', '1')`
- Debug is also enabled automatically in local DEV builds.

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
- `STORYBOARD_RENDER_SOURCE`
- `SHOTCARD_IMG_MOUNT`
- `SHOTCARD_IMG_SRC_CHANGE`
- `SHOTCARD_IMG_LOAD`
- `SHOTCARD_IMG_ERROR`
- `SHOTCARD_IMG_UNMOUNT`
- `SHOTCARD_DUPLICATE_ASSET_ID_VISIBLE`
- `SHOTCARD_DUPLICATE_DISPLAY_SRC_VISIBLE`
- `SHOTCARD_VISIBLE_SNAPSHOT_SYNC_STATUS`
- `STORYBOARD_REVERT_DETECTED`

## Instrumented source labels
- `initial_cloud_load`
- `hydrate_project_snapshot`
- `incoming_cloud_snapshot`
- `pending_remote_snapshot`
- `head_alignment`
- `live_storyboard_subscription_apply`
- `live_storyboard_deferred_apply`

## Temporary assignment audit (this pass)
- Console prefix: `[SHOT_IMAGE_ASSIGN_AUDIT]`
- Added in:
  - `ShotCard` image assignment handlers (`clearShotImage`, `assignLibraryAssetToShot`, `handleImageChange`)
  - `store.updateShotImage`
  - `CloudSyncCoordinator.applyLiveStoryboardSync` (live-table shot upserts)
- Optional render experiment flag:
  - `?ssStableAssetSrcOnly=1`
  - `localStorage.setItem('ssStableAssetSrcOnly','1')`
- Live shot sync writer experiment flag:
  - `?ssOnlySyncEditedShot=1`
  - `localStorage.setItem('ssOnlySyncEditedShot','1')`
- Live sync semantic audit prefix:
  - `[LIVE_SHOT_SYNC_AUDIT]`
- Reorder persistence audit prefix:
  - `[SHOT_REORDER_AUDIT]`
- Reorder force-persist experiment:
  - `?ssForcePersistReorder=1`
  - `localStorage.setItem('ssForcePersistReorder','1')`
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
- Instrumentation is trace-only and debug-flag focused.
- No permanent bug fix is implemented in this pass.

## Follow-up finding and scoped fix (2026-04-07)
- Confirmed overwrite source path: `live_storyboard_subscription_apply` -> `applyLiveStoryboardState`.
- `pendingRemoteSnapshot` replay was not the active overwrite path at revert time.
- Scoped mitigation in `applyLiveStoryboardState` now preserves existing shot `image` / `imageAsset` when incoming live row image payload is empty or older than the latest local storyboard edit timestamp.
