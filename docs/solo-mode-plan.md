# Solo mode plan (controlled collaborator-aware optimization)

## Scope
This plan defines a low-risk runtime optimization for cloud projects where a user is effectively working alone.

It is **not** offline mode and does **not** replace Convex as source of truth.

## What solo mode means in ShotScribe
- **Collaborative mode:** default real-time behavior; live storyboard writes happen immediately.
- **Solo mode:** if no other active presence rows are detected for the project, live storyboard writes are buffered briefly in memory and flushed on a short timer or safety trigger.

Mode switches are runtime-only and reversible.

## What stays live in solo mode
- user/auth identity
- project identity + access policy
- snapshot-head freshness
- presence signal for collaborator detection
- standard save/sync snapshot pipeline

## What becomes quieter
- live scene/shot upsert cadence (`projectScenesLive:upsertScene`, `projectShotsLive:upsertShot`) is debounced in solo mode
- no-op suppression still prevents unchanged upserts when flush occurs
- storyboard asset requests avoid rerender-triggered refetch with stable keying and short-lived caches

## Collaboration typing safety guard
- Live storyboard apply from subscription data is deferred while local unsaved edits are active.
- This prevents local controlled inputs from being clobbered mid-typing during shared sessions.
- Pending live state still applies after local unsaved edits clear, preserving collaboration convergence.

## Pending changes buffer
- **Current implementation:** in-memory only (`pendingLiveSyncRef`), latest payload wins.
- Flush triggers:
  1. solo debounce timer
  2. collaborator detected
  3. `visibilitychange` (hidden)
  4. `pagehide` / `beforeunload`
- Failed flush retains pending payload in-memory for next attempt.
- Project switch/unmount clears queue/timer to prevent stale cross-project carryover.

## Collaborator-join behavior
When collaborator count transitions to > 0:
1. pending solo payload flushes immediately
2. subsequent live sync calls use immediate collaborative cadence

## Risks / limitations
- Presence is the “alone” signal; if presence is stale/incomplete, mode can lag (safe fallback because snapshot sync path is still active).
- In-memory queue is not durable across hard crashes.
- No complex merge engine added in this pass by design.
- Guarding live apply during active unsaved edits can delay remote-field visibility briefly while the user is typing.

## Expected impact
- fewer live mutation calls during solo burst editing
- reduced Convex bandwidth from avoided intermediate upserts
- collaboration safety preserved via immediate flush and mode switch

## Manual QA checklist
1. Solo editing: rapid shot/scene edits persist and UX remains unchanged.
2. Manual save + autosave continue to work as before.
3. Collaborator joins mid-edit: pending changes flush and real-time collaboration continues.
4. Hide tab / unload page while editing: pending flush path executes.
5. Storyboard thumbnails and library previews still load correctly.
6. Presence/locks still behave normally in script collaboration flows.
7. In two-user typing sessions, verify no skipped letters/caret jump while remote updates still converge after local pause/save.

## Rollback
- Revert solo debounce branch and always execute immediate live sync writes.
- Keep asset request stabilization independent if desired.
