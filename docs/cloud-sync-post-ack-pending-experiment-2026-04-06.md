# Dev Experiment: Disable Post-Ack Pending Remote Apply (2026-04-06)

## Purpose
Temporary DEV-only experiment to test whether the post-ack `pendingRemoteSnapshot` replay branch is the direct cause of storyboard image reverts.

## Implementation
- Added `DISABLE_POST_ACK_PENDING_REMOTE_APPLY` in `src/components/CloudSyncCoordinator.jsx`.
- In the pending-snapshot effect, when all are true:
  - pending snapshot exists for current cloud project,
  - local dirty has cleared,
  - `_lastAckedSnapshotId` exists,
  - and pending was queued during dirty (when provenance exists),
  then the effect **skips** `applyPendingRemoteSnapshot()` in DEV and logs one message, then clears pending.

## Scope and safety
- DEV-only behavior (`import.meta.env.DEV`).
- Production behavior remains unchanged by this experiment guard.
- This is temporary hypothesis-testing code, not final architecture.

## Local QA flow
1. Open a cloud-enabled project.
2. Go to Storyboard.
3. Change a shot image.
4. Wait for “syncing” -> “cloud backup ready”.
5. Observe whether image revert still happens.
6. Refresh and confirm persisted data is correct.

## Interpreting results
- If revert disappears: strong evidence post-ack pending replay branch was culprit.
- If revert persists: hypothesis falsified; continue by auditing other overwrite entry points.
