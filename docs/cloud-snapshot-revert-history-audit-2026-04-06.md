# Cloud Snapshot Revert Bug — Git History Audit (2026-04-06)

## Scope
Files audited from recent history:
- `src/components/CloudSyncCoordinator.jsx`
- `src/store.js`
- storyboard shot/image mapping in `loadProject` and related mapping paths

## Relevant commits (newest first)

1. `48a5212` — **Discard pending cloud snapshot queued during local dirty cycle via causal marker**
   - Files: `src/components/CloudSyncCoordinator.jsx`, `src/store.js`, docs.
   - Adds `queuedWhileDirtyRevision` marker and causal discard in coordinator.

2. `0119b90` — **Discard stale deferred snapshots before pending apply**
   - Files: `src/components/CloudSyncCoordinator.jsx`, `src/store.js`.
   - Adds effect-time discard checks:
     - `pendingSnapshotId === lastAckedSnapshotId` => discard
     - `pendingSnapshotId !== latestSnapshotHead.latestSnapshotId` => discard
   - Changes pending-apply gate from `hasUnsavedChanges` to `_cloudDirtyRevision`.

3. `a7219c7` / `92e66f5` / `05c9914` (same patch lineage)
   - `05c9914`: **Wire missing cloud snapshot acks and hydrate dirty deferral**
   - `92e66f5`: **Tighten pending snapshot discard check on cloud ack**
   - `a7219c7`: **Always clear deferred snapshot on cloud ack**
   - Files: `src/components/CloudSyncCoordinator.jsx`, `src/store.js` (+ docs/script file in some variants).
   - Introduces `_cloudDirtyRevision`, `_lastAckedSnapshotId`, `acknowledgeCloudSnapshot`, and dirty-window deferral queueing during hydration and incoming snapshot apply.

4. `a75741a` — **Guard cloud snapshot apply with cloud-dirty ack tracking**
   - Files: `src/components/CloudSyncCoordinator.jsx`, `src/store.js`.
   - Earlier version of the dirty/ack architecture and pending apply gating shift.

5. `cc48f46` — **Add phase-1 live storyboard entities with lazy cloud migration**
   - Files: `src/components/CloudSyncCoordinator.jsx`, `src/store.js`.
   - First introduction of `pendingRemoteSnapshot` queue + coordinator pending apply effect.

## Exact hunks most related to the revert behavior

### A) Pending queue + deferred apply first introduced (`cc48f46`)
- Coordinator added effect:
  - if cloud project, no unsaved changes, and pending exists -> `applyPendingRemoteSnapshot()`.
- Store `applyIncomingCloudSnapshot` changed to queue `pendingRemoteSnapshot` when local changes/sync-in-flight exist.

Why this matters:
- This introduced the core deferred-remote-apply mechanism that can later replay queued payloads.

### B) Dirty/ack lifecycle introduced (`05c9914` lineage / `a75741a`)
- `_cloudDirtyRevision` and `_lastAckedSnapshotId` added to store.
- Pending queue condition switched from `hasUnsavedChanges` to `_cloudDirtyRevision !== null || _cloudSyncInFlight`.
- Coordinator pending effect switched gate from `hasUnsavedChanges` to `cloudDirtyRevision !== null`.
- `acknowledgeCloudSnapshot()` added and called on write success/head alignment.

Why this matters:
- This created the exact timing window discussed in the bug report:
  pending snapshot can be queued while dirty, then applied after dirty clears.

### C) Attempted effect-time discard heuristics added (`0119b90`)
- In coordinator effect:
  - discard pending if same as acked snapshot
  - discard pending if different from latest head
  - else apply pending

Why this matters:
- This is the exact guard set that still allows stale apply when there is a render where pending id equals head id but is older than the just-acknowledged local write.

## Storyboard mapping audit (image/imageAsset)

### Current mapping path
- `applyPendingRemoteSnapshot()` -> `applyIncomingCloudSnapshot()` -> `loadProject(payload)`.
- `loadProject` shot mapper sets:
  - `image: s.imageAsset?.thumb || s.image || null`
  - `imageAsset` reconstructed from incoming payload.

### Blame timeline for mapping lines
- `loadProject` shot image/imageAsset mapping lines are older (primarily from March 2026 commits such as `2b94c58` and related media lifecycle work), not introduced in the April 6 dirty/ack changes.

Conclusion from history:
- The revert bug is most strongly correlated with deferred pending snapshot apply timing, not with newly introduced storyboard-only mapping code in `loadProject`.
- Storyboard appears affected in practice because those fields visibly differ between stale queued payload and local in-memory edits at the time of replay.

## Likely introduction point

### Earliest introduction of the replay class of bug
- **`cc48f46`** introduced queued pending snapshot replay mechanism and coordinator effect-based apply.

### Most likely introduction of the currently observed post-ack timing variant
- **`05c9914` lineage (including `a75741a`, `92e66f5`, `a7219c7`, `0119b90`)** introduced dirty/ack state transitions and effect-time heuristics that made this specific stale-after-ack window explicit.

## Categorization requested

- Pending snapshot queue timing: **Primary contributor**.
- Ack/dirty clearing order: **Primary contributor**.
- `loadProject` remapping: **Overwrite mechanism**, but not the newly introduced root trigger.
- Storyboard-only field mapping differences: **Not likely root-cause introduction in recent commits**; it is where stale payload is most visibly observed.

## Current vs last-known-good comparison snapshot

- Pre-`cc48f46`: no pending snapshot deferred-apply effect path present in coordinator/store.
- Post-`cc48f46`: deferred queue/replay path exists.
- Post-`05c9914` lineage: dirty/ack-driven pending lifecycle expands; stale pre-ack queued snapshots can survive into dirty-clear window and be replayed unless causally discarded.
