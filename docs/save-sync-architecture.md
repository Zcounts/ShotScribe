# Save + Sync architecture (April 2, 2026)

## Audit summary

### Desktop/web app (`src/`)
- Local persistence is still the foundation:
  - browser mode writes local snapshots through `platformService.saveBrowserProjectSnapshot` and autosave to localStorage.
  - desktop shell mode writes `.shotlist` files through Electron APIs.
- Cloud persistence for paid users continues to use Convex project snapshots (`projectSnapshots:createSnapshot`).
- Previous behavior made local and cloud status hard to interpret in the UI (primarily `lastSaved` + `hasUnsavedChanges` only).

### Mobile companion (`mobile/`)
- Mobile remains local-first and stores imported day/snapshot data in localStorage.
- Shot status overrides are local and persist immediately on-device.
- Shared contract now supports `skipped` status alongside `todo` / `in_progress` / `done` so status shape is consistent.

## Implemented save/sync model

### Local-first write path
1. Edits update the in-memory working copy immediately.
2. Local autosave/local snapshot remains first persistence layer.
3. For cloud projects with paid write access, cloud snapshot sync is queued/debounced.

### Cloud sync queue (lightweight)
- Debounce window: 8 seconds.
- Queue is intentionally small and reversible (single pending timeout + in-flight guard).
- Solo cloud sync uses conflict-aware writes (`fail_on_conflict`) to avoid silent overwrite.
- Collaboration-capable context can still use `last_write_wins` when configured.

### Explicit sync points
- Cloud sync context is set centrally from cloud auth/policy state.
- Flush hooks run on lifecycle transitions (`beforeunload`, `pagehide`) when there are unsaved changes.

### Save/sync state surfaced in UI
State model now exposes human-readable statuses:
- Local-only: saved locally / unsaved local changes.
- Cloud project with sync access: unsaved changes, syncing, synced.
- Cloud blocked/read-only: saved locally + cloud sync unavailable.
- Cloud failure: saved locally + cloud sync failed.

## Notes for product behavior
- Free users remain local-only.
- Paid users keep local working-copy editing and get cloud sync as an additional layer.
- Cloud writes are throttled via debounce to reduce unnecessary snapshot churn during solo editing.

## Manual QA checklist

### 1) Free local-only save
1. Start app with cloud disabled.
2. Create/edit project fields.
3. Confirm toolbar status shows local language (e.g. unsaved local changes, then saved locally after save).
4. Reload and verify data persists from local snapshot / file.

### 2) Paid local + cloud sync
1. Start app with cloud enabled and paid account.
2. Open cloud project.
3. Make several rapid edits.
4. Confirm toolbar transitions through unsaved -> syncing -> synced.
5. Confirm Convex snapshot history receives debounced writes (not per keystroke).

### 3) Desktop edit then mobile open
1. On desktop cloud project, complete edits and wait for synced state.
2. Export current mobile package/snapshot.
3. Import into mobile app.
4. Confirm day and shot data reflects latest desktop edits.

### 4) Mobile shot update then desktop reopen
1. In mobile app, cycle a shot into `done` and `skipped` states.
2. Confirm local mobile state persists after refresh.
3. Re-open/export path back to desktop workflow and verify shared status shape remains valid.

### 5) Offline-ish recovery behavior
1. Open cloud project and disconnect network.
2. Make edits.
3. Confirm toolbar indicates local save with cloud unavailable/failed sync.
4. Reconnect network and trigger additional edit; confirm sync recovers to synced state.
