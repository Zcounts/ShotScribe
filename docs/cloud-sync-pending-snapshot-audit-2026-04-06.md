# Cloud Sync Pending Snapshot Audit (2026-04-06)

## Scope
Audit-only pass for storyboard image reversion after sync transition to "cloud backup ready".
No behavior changes were implemented.

## Code path references
- `src/components/CloudSyncCoordinator.jsx`
- `src/store.js`

### `CloudSyncCoordinator` references
- `pendingRemoteSnapshot` selector: line 139.
- `applyPendingRemoteSnapshot` selector: line 140.
- `cloudDirtyRevision` selector (`_cloudDirtyRevision`): line 142.
- `lastAckedSnapshotId` selector (`_lastAckedSnapshotId`): line 143.
- `acknowledgeCloudSnapshot` selector: line 144.
- `latestSnapshotHead` subscription: lines 206-209.
- Snapshot head sync effect: lines 976-1033.
- Pending snapshot effect (calls `applyPendingRemoteSnapshot`): lines 1035-1059.

### `store` references
- state fields: `_cloudDirtyRevision`, `_lastAckedSnapshotId`, `pendingRemoteSnapshot`: lines 815-817.
- `applyIncomingCloudSnapshot`: lines 4249-4321.
- `applyPendingRemoteSnapshot`: lines 4323-4331.
- `acknowledgeCloudSnapshot`: lines 4336-4353.

## Exact effect that can call `applyPendingRemoteSnapshot`

File: `src/components/CloudSyncCoordinator.jsx` (lines 1035-1059)

```jsx
  useEffect(() => {
    if (!cloudProjectId || cloudDirtyRevision !== null) return
    if (!pendingRemoteSnapshot) return
    if (pendingRemoteSnapshot.projectId !== cloudProjectId) return
    const pendingSnapshotId = String(pendingRemoteSnapshot.snapshotId || '')
    const ackedSnapshotId = String(lastAckedSnapshotId || '')
    const latestHeadSnapshotId = String(latestSnapshotHead?.latestSnapshotId || '')
    if (pendingSnapshotId && ackedSnapshotId && pendingSnapshotId === ackedSnapshotId) {
      clearPendingRemoteSnapshot()
      return
    }
    if (pendingSnapshotId && latestHeadSnapshotId && pendingSnapshotId !== latestHeadSnapshotId) {
      clearPendingRemoteSnapshot()
      return
    }
    applyPendingRemoteSnapshot()
  }, [
    applyPendingRemoteSnapshot,
    clearPendingRemoteSnapshot,
    cloudDirtyRevision,
    cloudProjectId,
    lastAckedSnapshotId,
    latestSnapshotHead?.latestSnapshotId,
    pendingRemoteSnapshot,
  ])
```

### Dependency array
- `applyPendingRemoteSnapshot`
- `clearPendingRemoteSnapshot`
- `cloudDirtyRevision`
- `cloudProjectId`
- `lastAckedSnapshotId`
- `latestSnapshotHead?.latestSnapshotId`
- `pendingRemoteSnapshot`

### State/values read by this effect
- `cloudProjectId`
- `cloudDirtyRevision` (`_cloudDirtyRevision` via selector)
- `pendingRemoteSnapshot` (including `projectId` and `snapshotId`)
- `lastAckedSnapshotId` (`_lastAckedSnapshotId` via selector)
- `latestSnapshotHead?.latestSnapshotId`

### Branches that can lead to `applyPendingRemoteSnapshot`
`applyPendingRemoteSnapshot()` is called only when all of these are true:
1. `cloudProjectId` exists
2. `cloudDirtyRevision === null`
3. `pendingRemoteSnapshot` exists
4. `pendingRemoteSnapshot.projectId === cloudProjectId`
5. NOT (`pendingSnapshotId && ackedSnapshotId && pendingSnapshotId === ackedSnapshotId`)
6. NOT (`pendingSnapshotId && latestHeadSnapshotId && pendingSnapshotId !== latestHeadSnapshotId`)

Equivalent final gate to apply:
- `pendingSnapshotId` is empty OR
- `latestHeadSnapshotId` is empty OR
- `pendingSnapshotId === latestHeadSnapshotId`

## Runtime instrumentation + reproduction status
Temporary instrumentation was added only inside the above effect and then removed in the same audit pass.

### Reproduction attempt result
Could not reproduce in this CI/container environment because an interactive authenticated cloud project session (required to perform storyboard image edits and observe live sync state transitions) is not available here.

What was attempted:
- Started app locally: `npm run dev -- --host 127.0.0.1 --port 4173`.
- Confirmed Vite served the app.
- Could not complete interactive cloud-authenticated storyboard edit/sync flow from this non-interactive terminal-only environment.

Because the required UI flow could not be executed, no runtime `[PENDING_SNAPSHOT_AUDIT]` log capture was produced.

## Why Attempt 3 fails (code-level control-flow certainty)
Attempt 3 adds a discard check in this effect:
- discard when `pending.snapshotId !== latestSnapshotHead.latestSnapshotId`.

This does **not** prevent stale apply in the render where:
- dirty has just cleared,
- pending is still present,
- and `latestSnapshotHead.latestSnapshotId` at that render still equals the stale pending snapshot ID.

In that render, the inequality guard is false, so control reaches `applyPendingRemoteSnapshot()`.

Later renders may have a newer `latestSnapshotHead.latestSnapshotId`, but by then the stale payload may already have been applied via `loadProject(payload)` in `applyIncomingCloudSnapshot`.

This is a timing/order issue across effect executions with different inputs, not an order-comparable ID issue.

## Correct discard rule (description only, not implemented)
The pending snapshot should only be applied if it is proven to be newer than or equal to the local acknowledged state by a **causal marker that is order-safe**, not by opaque snapshot ID string comparison or one-shot head equality at effect time.

Given current architecture, the safe rule is:
- When local dirty clears because write is acknowledged, pending snapshots captured during the dirty window must be discarded unless they are explicitly tied to the just-acked write causally (same operation lineage marker) rather than snapshot-ID inequality/equality against a moving head.

In practice this requires a stable causal token per local write cycle (e.g., write revision/operation token) carried into pending entries and compared on apply.

## Cleanup confirmation
- All temporary `[PENDING_SNAPSHOT_AUDIT]` logging was removed.
- No permanent runtime behavior change was made in source code.

## Follow-up implementation (2026-04-06)
- Added causal pending metadata (`queuedWhileDirtyRevision`) when queuing remote snapshots during a local dirty window.
- Updated the coordinator pending-snapshot effect to discard any pending snapshot queued during a dirty window once a local snapshot ack exists.
- This prevents stale pre-ack payloads from being applied after sync transitions to ready.
