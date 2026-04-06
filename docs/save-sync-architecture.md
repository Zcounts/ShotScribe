# Save + Sync architecture (April 2026)

## Audit summary

### Desktop/web app (`src/`)

- Local persistence is the primary write path:
  - Browser mode writes to localStorage via `platformService.saveAutosave` and
    `persistBrowserProjectState`.
  - Optional desktop-bridge mode writes `.shotlist` files via `window.electronAPI` when present.
- Cloud persistence for paid users is layered on top via Convex project snapshots
  (`projectSnapshots:createSnapshot`).
- Save/sync state is exposed through a `saveSyncState` object in the Zustand store with
  six concrete statuses (see below).

### Mobile companion (`mobile/`)

- Mobile is local-first: imported day/snapshot data lives in localStorage under
  `shotscribe.mobile.library.v1`.
- Shot field edits (status, notes, timing) are persisted to localStorage immediately and
  synchronously on every change — no data is ever lost to a debounce window.
- Cloud snapshot writes are **debounced** (6 seconds) so a burst of rapid shot-status
  changes produces only one cloud write, not one per tap.
- The Convex snapshot write now passes `expectedLatestSnapshotId` for version awareness.
  Because mobile always uses `last_write_wins`, conflicts are resolved by recency rather
  than rejected — this is intentional for the on-set workflow where mobile is the
  authoritative source during a shoot day.

---

## Save/sync state model

### Status values

| Status | When set | UI message |
|--------|----------|------------|
| `unsaved_changes` | Edit received, local save not yet flushed | "Changes not yet saved" |
| `saved_locally` | Local write complete; cloud pending or unavailable | "Saved on device · uploading soon" / "Saved on this device" |
| `syncing_to_cloud` | Convex snapshot mutation in-flight | "Uploading to cloud…" |
| `synced_to_cloud` | Snapshot write confirmed | "Saved on device · backed up to cloud" |
| `cloud_sync_failed` | Snapshot write threw or returned an error | "Saved on device · cloud backup failed" |
| `cloud_blocked_local_assets` | Cloud save preflight found local inline image assets without cloud IDs | "Cloud backup is paused — uploads required first" |
| `cloud_blocked` | Paid access unavailable or cloud writes disabled | "Saved on device · cloud backup unavailable" |

### Mode values

| Mode | Meaning |
|------|---------|
| `local_only` | Free user or no cloud configured |
| `cloud_solo` | Paid user, solo editing |
| `cloud_collab` | Paid user, collaboration-capable context |
| `cloud_blocked` | Cloud context present but writes disabled |

---

## Write paths in detail

### Local-first write path (all users)

1. User edits the in-memory working copy — visible immediately.
2. `_scheduleAutoSave` debounces 2.5 s then writes to localStorage (or to a desktop bridge when present).
3. While debounce is pending: status is `unsaved_changes`.
4. After local write: status moves to `saved_locally`.

### Cloud sync path (paid users, cloud projects)

5. `_scheduleCloudSync` debounces an additional 8 s after the last edit.
6. When the timeout fires, `flushCloudSync` writes a full project snapshot to Convex.
7. During write: status is `syncing_to_cloud` (dot pulses in toolbar).
8. On success: status is `synced_to_cloud`; `projectRef.snapshotId` is updated.
9. On failure: status is `cloud_sync_failed`; the error is surfaced in the toolbar tooltip.
    The local copy is safe — the next edit will queue another cloud attempt.
10. If inline local assets are still pending cloud migration, preflight sets
    `cloud_blocked_local_assets` with an actionable upload message instead of
    reporting a generic payload-size failure.

### Convex auth bootstrap guard (regression note)

- `CloudSyncCoordinator` now waits for `useConvexAuth()` to finish loading before performing the
  one-shot `users:currentUser` / `billing:getMyEntitlement` boot reads.
- If those reads run before Convex identity is ready, they can resolve as unauthenticated and
  incorrectly seed Zustand with `currentUser = null`, which blocks cloud mutations that require
  `createdByUserId`.
- This guard preserves the cache optimization while preventing a session-long false unauthenticated
  state that disables cloud saves.

### Local → cloud storyboard image backfill

When a project is switched from local-only to cloud backup, ShotScribe now runs a targeted
backfill pass for storyboard shots that still reference inline local image URLs (`data:`,
`blob:`, or `file:`):

1. Detect shots that have an image but no `imageAsset.cloud.assetId`.
2. Upload each unique local image source into the cloud asset pipeline.
3. Register uploaded assets in the Project Media Library and assign each shot to the
   corresponding library asset.
4. Rewrite shot image payloads to cloud-backed `imageAsset.cloud.assetId` references.
5. Flush one cloud snapshot after migration so collaborators and reopened sessions load
   the migrated images.

This keeps local-first behavior intact while making local → cloud conversion seamless for
existing storyboard images.

**Conflict handling:**
- Solo mode: `fail_on_conflict` — rejected if `expectedLatestSnapshotId` doesn't match.
  The UI shows `cloud_sync_failed`; the user can reload to get the latest snapshot.
- Collaboration mode: `last_write_wins` — always accepted; later write is authoritative.

**Key debounce constants (src/store.js):**
```js
LOCAL_PERSIST_DEBOUNCE_MS = 2500   // local autosave
CLOUD_SYNC_DEBOUNCE_MS    = 8000   // cloud snapshot write
```

### Mobile cloud sync path

```
Shot edit
  │
  ├─► localStorage write (immediate — data is safe)
  │
  └─► scheduleCloudSave()
        │  debounce 6 s (MOBILE_CLOUD_SYNC_DEBOUNCE_MS)
        └─► flushCloudSave()
              ├─ applyEditsToCloudPayload (merge local edits onto latest snapshot payload)
              ├─ createSnapshot({ …, expectedLatestSnapshotId, conflictStrategy: 'last_write_wins' })
              └─ syncState → 'synced' | 'sync_failed'
```

Mobile sync state banner (shown in cloud mode only):
- `unsaved_changes` → "Shot changes saved on device · uploading soon…"
- `syncing` → "Uploading to cloud…"
- `synced` → "Backed up to cloud · HH:MM"
- `sync_failed` → "Saved on device · cloud backup failed. Changes will upload on next edit."

---

## Unsaved-changes exit protection

Exit guards fire when `hasUnsavedChanges === true` **and** `saveSyncState.status === 'unsaved_changes'`.
They are intentionally **not** triggered while cloud sync is pending (status `saved_locally` or
`syncing_to_cloud`) — local data is already safe at that point.

Guarded transitions:
- `beforeunload` / `pagehide` (browser refresh / tab close)
- `popstate` (browser back/forward)
- In-app Account/Admin route pushes

---

## Free vs paid behavior

| Feature | Free / local | Paid / cloud |
|---------|-------------|--------------|
| Local autosave | Yes | Yes |
| Cloud snapshot sync | No | Yes (debounced, 8 s) |
| Conflict detection | N/A | `fail_on_conflict` in solo mode |
| Mobile cloud sync | N/A | Yes (debounced, 6 s) |
| Collaboration mode | No | Yes (opt-in, `last_write_wins`) |

---

## Manual QA checklist

### 1. Free / local-only save

1. Start app with cloud disabled (`VITE_ENABLE_CLOUD_FEATURES` not set or `false`).
2. Create a new project and add a shot.
3. Confirm toolbar status dot turns gray and shows **"Changes not yet saved"**.
4. Wait ~2.5 s. Confirm dot stays gray and message changes to **"Saved on this device · HH:MM"**.
5. Hard-refresh the page. Confirm the project reloads from localStorage with shot intact.
6. Confirm no network requests to Convex are made (check DevTools Network tab).

---

### 2. Paid local + cloud sync

1. Start app with cloud enabled and a paid account. Open a cloud project.
2. Make several rapid edits (type in a shot description, change status).
3. Confirm toolbar dot turns gray / message shows **"Changes not yet saved"** immediately.
4. After ~2.5 s: message transitions to **"Saved on device · uploading soon"**.
5. After ~8 s from last edit: dot turns blue and pulses; message shows **"Uploading to cloud…"**.
6. On completion: dot turns green; message shows **"Saved on device · backed up to cloud · HH:MM"**.
7. In Convex dashboard, verify only 1–2 snapshots were created (not one per keystroke).
8. Refresh page. Confirm project reloads from cloud snapshot with all edits present.

### 2b. Local-only storyboard images → cloud backup conversion

1. Start local-only, add storyboard images to multiple shots, then enable **Cloud Backup**.
2. Open a shot image picker and confirm migrated images appear in **Project Media Library**.
3. Refresh and reopen the cloud project; confirm storyboard images remain attached.
4. Share the project with a collaborator account; confirm collaborator sees the same images.
5. Save/sync again and verify no duplicate media items are created for already migrated shots.

---

### 3. Desktop edit → mobile open

1. On desktop cloud project, make edits and wait for the green **"backed up to cloud"** state.
2. On mobile, switch to **Cloud Project Mode** and sign in.
3. Open the same project.
4. Confirm the mobile view shows the updated shot data from the desktop edits.
   *(Mobile fetches the latest Convex snapshot on open.)*

---

### 4. Mobile shot update → desktop reopen

1. In mobile **Cloud Project Mode**, open a project day.
2. Cycle a shot status to **done**, then another to **skipped**.
3. Confirm the sync state banner shows "Shot changes saved on device · uploading soon…"
   then "Uploading to cloud…" then "Backed up to cloud · HH:MM" within ~6 s.
4. On desktop, close and reopen the same cloud project.
5. Confirm the shots show the updated status (done / skipped) from mobile.
6. As a cross-check: verify the shots' `status` and `checked` fields on the Convex snapshot
   match expectations (`done` → `checked: true`, `skipped` → `checked: false`).

---

### 5. Offline / cloud-unavailable recovery

1. Open a paid cloud project on desktop.
2. Disconnect the network (DevTools → Network → Offline).
3. Make edits. Confirm toolbar shows **"Changes not yet saved"** then **"Saved on device · cloud backup unavailable"** or **"Saved on device · cloud backup failed"**.
4. Reconnect the network.
5. Make one more small edit. Confirm the cloud sync cycle runs to **"backed up to cloud"**.
6. Verify data is consistent between the local snapshot and what Convex shows.

---

### 6. Unsaved-changes warnings

1. Open any editable tab and make an edit.
2. Within ~2.5 s (before local autosave completes), test each exit path:
   - Refresh the browser tab.
   - Close the tab.
   - Click the browser back button.
   - Click the Account or Admin toolbar button.
3. Confirm the browser's native warning dialog appears; cancel keeps you on the page.
4. Wait for the toolbar to show a locally-saved state (dot goes gray, time appears).
5. Repeat each exit path — the warning should **not** appear once local save is done.
6. For cloud projects, confirm that while status is **"uploading soon"** or **"Uploading to cloud…"**,
   the exit warning does **not** fire (local data is already safe).
