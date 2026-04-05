# Convex Usage Audit — ShotScribe

Date: 2026-04-05
Scope: `convex/` + web app React usage (`src/`) only (mobile untouched).

## 1) Executive summary

Your Convex overage is primarily a **reactive read amplification** issue, not a write issue.

Highest impact causes verified in code:

1. **Per-shot duplicate subscriptions** to `assets:listProjectLibraryAssets` and `assets:getRecentlyDeletedLibraryAssets` from every `ShotCard` instance (often dozens active at once).
2. **Always-live collaboration queries** (`presence`, `locks`, `members`, and project list) inside `SaveSyncStatusControl` even when the popover is closed.
3. **Duplicate identity / collaboration subscriptions** across components (`users:currentUser`, `presence`, `locks`) during script workflows.
4. **Heavy snapshot payload reads/writes** (`projectSnapshots.payload`) that are full-document, monolithic snapshots.
5. **Broad server-side `.collect()` + in-memory filtering** in several high-frequency query paths (`projects`, `assets`, `presence`, `screenplayLocks`) increasing read bandwidth per call.

I implemented only low-risk, behavior-preserving changes to reduce call count and read bandwidth now, and documented higher-risk architecture changes for later.

---

## 2) Top usage drivers ranked by impact

### A. Per-shot library subscriptions in `ShotCard` (HIGH)
- **Resource affected:** function calls, DB bandwidth
- **Why expensive:** each shot card subscribed independently to the same project-wide asset queries. On a board with many cards, this multiplies identical query calls and payload delivery.
- **Evidence:** `ShotCard` had its own `useQuery('assets:listProjectLibraryAssets')` + `useQuery('assets:getRecentlyDeletedLibraryAssets')`.
- **Fix:** moved both subscriptions to `ShotGrid` (single subscription per grid render context) and passed results down as props.
- **Status:** ✅ changed.

### B. Hidden UI still subscribing in Save/Sync popover (HIGH)
- **Resource affected:** function calls, DB bandwidth, reactive churn
- **Why expensive:** collaboration/project list queries were live regardless of whether the panel was open.
- **Evidence:** `SaveSyncStatusControl` queried projects/members/presence/locks before open state checks.
- **Fix:** gate these queries by popover open state.
- **Status:** ✅ changed.

### C. Duplicate identity/collab subscriptions in script flow (MEDIUM-HIGH)
- **Resource affected:** function calls, DB bandwidth
- **Why expensive:** `ScriptTabLegacy` subscribed to `users:currentUser` despite user id already propagated in `cloudSyncContext` by `CloudSyncCoordinator`.
- **Fix:** removed redundant `users:currentUser` subscription from `ScriptTabLegacy`; re-used store context user id.
- **Status:** ✅ changed.

### D. Heavy snapshot payload reads/writes (HIGH)
- **Resource affected:** DB bandwidth, storage growth
- **Why expensive:** latest snapshot query returns full `payload`; create snapshot stores full payload each save/autosave.
- **Evidence:** `projectSnapshots:createSnapshot` writes full `payload`; `getLatestSnapshotForProject` returns entire document.
- **Fix now:** added temporary usage diagnostics to measure payload byte size on read/write for proof and prioritization.
- **Status:** ⚠️ measured + documented (no risky model refactor done).

### E. Scan-heavy `.collect()` and post-filtering (MEDIUM)
- **Resource affected:** DB bandwidth/calls
- **Why expensive:** multiple queries collect wide row sets, then filter/sort in memory.
- **Evidence examples:**
  - `assets:listProjectLibraryAssets`
  - `assets:getRecentlyDeletedLibraryAssets`
  - `projects:listProjectsForCurrentUser` (plus fallback snapshot checks)
  - `presence:listProjectPresence`
  - `screenplayLocks:listProjectLocks`
- **Fix:** documented medium-risk index/pagination refinements for next pass.
- **Status:** documented only (to avoid behavioral risk now).

---

## 3) Evidence per finding

### Finding 1 — ShotCard subscription fanout
- Severity: **high**
- Expensive because each visible card mounted duplicate project-wide queries.
- Changed: yes.
- Files: `src/components/ShotCard.jsx`, `src/components/ShotGrid.jsx`.

### Finding 2 — Save/Sync hidden subscriptions
- Severity: **high**
- Expensive because closed panel still subscribed to collaboration and cloud project queries.
- Changed: yes.
- Files: `src/components/SaveSyncStatusControl.jsx`.

### Finding 3 — Script user query duplication
- Severity: **medium**
- Expensive because identity query duplicated while same user id already lives in store context.
- Changed: yes.
- Files: `src/components/ScriptTabLegacy.jsx`, `src/components/CloudSyncCoordinator.jsx`.

### Finding 4 — Snapshot payload size is main bandwidth/storage risk
- Severity: **high**
- Expensive because full snapshot payloads are repeatedly read/written and retained.
- Changed: diagnostics only.
- Files: `convex/projectSnapshots.ts`.

### Finding 5 — Broad collect/filter query patterns
- Severity: **medium**
- Expensive because DB reads rows beyond what is rendered.
- Changed: documented only.
- Files: `convex/projects.ts`, `convex/assets.ts`, `convex/presence.ts`, `convex/screenplayLocks.ts`.

---

## 4) Exact files/functions/components involved

### Front-end subscriptions
- `src/components/ShotCard.jsx`
- `src/components/ShotGrid.jsx`
- `src/components/SaveSyncStatusControl.jsx`
- `src/components/ScriptTabLegacy.jsx`
- `src/components/ProjectPropertiesDialog.jsx`
- `src/components/CloudSyncCoordinator.jsx`
- `src/features/billing/useCloudAccessPolicy.js`

### Convex functions (high traffic candidates)
- `presence:listProjectPresence` (`convex/presence.ts`)
- `screenplayLocks:listProjectLocks` (`convex/screenplayLocks.ts`)
- `projects:getProjectById` / `projects:listProjectsForCurrentUser` (`convex/projects.ts`)
- `projectSnapshots:getLatestSnapshotForProject` / `projectSnapshots:createSnapshot` (`convex/projectSnapshots.ts`)
- `projectMembers:listProjectMembers` (`convex/projectMembers.ts`)
- `users:currentUser` (`convex/users.ts`)
- `billing:getMyEntitlement` (`convex/billing.ts`)
- `assets:listProjectLibraryAssets` (`convex/assets.ts`)
- admin dashboard queries (`convex/admin.ts`)

---

## 5) What is causing function-call churn

1. Fanout from repeated `useQuery` in many child components (notably per-card `ShotCard`).
2. App-shell-ish controls (`SaveSyncStatusControl`) keeping queries live while hidden.
3. Repeated policy hooks (`useCloudAccessPolicy`) across many mounted components.
4. Presence/lock live reads plus heartbeat write loop while scripting collaboration is active.

---

## 6) What is causing bandwidth usage

1. Repeated delivery of identical project-wide query payloads to many subscribers.
2. Snapshot payload documents being large and read in full when latest snapshot changes.
3. `.collect()` query patterns pulling broad sets and filtering in app/function memory.
4. Project list logic touching snapshots to determine “usable projects.”

---

## 7) What is causing storage growth

1. `projectSnapshots` table stores full payload documents per snapshot save/autosave.
2. Snapshot history retention is unbounded in current flow.
3. Project row itself is small; snapshots dominate storage footprint.

---

## 8) Quick wins to ship now

1. ✅ Keep project-wide asset list subscriptions out of `ShotCard` and centralized at `ShotGrid`.
2. ✅ Keep Save/Sync collaboration queries unsubscribed unless the panel is open.
3. ✅ Reuse existing cloud user id from store in script tab instead of extra identity query.
4. ✅ Keep modal-only asset queries gated by modal open state (`ProjectPropertiesDialog`).
5. ✅ Enable diagnostics only when needed (`localStorage['ss_convex_diag']=1`, `CONVEX_USAGE_DIAGNOSTICS=1`).

---

## 9) Medium-risk refactors to consider later

1. Split snapshot metadata from payload and add lightweight “latest metadata” query for polling/churn checks.
2. Introduce snapshot retention/pruning policy (count- or age-based, with restore safeguards).
3. Replace broad asset/project list scans with tighter indexed access paths and/or pagination.
4. Consolidate entitlement/project policy subscriptions in a top-level provider to reduce repeated identical queries.
5. Tighten presence/lock query scope to only views/panels that render collaboration UI.

---

## 10) Do next (impact vs risk)

### Highest impact / low risk
1. Keep current merged fixes and monitor Convex usage for 24–48h after deploy.
2. Turn on diagnostics in staging only and capture top query fanout + payload sizes.
3. Validate no hidden subscriptions remain in non-visible UI shells.

### High impact / medium risk
4. Add lightweight `projectSnapshots:getLatestSnapshotMetaForProject` and use where payload is not required.
5. Add snapshot retention controls and prune old autosave snapshots.
6. Refine `listProjectsForCurrentUser` to avoid per-project fallback snapshot reads where possible.

### Medium impact / medium risk
7. Add/adjust indexes and query shapes for assets/presence/locks to reduce collect+filter paths.
8. Introduce route-level query ownership for billing/user/project policy data.

---

## Diagnostics added (temporary)

### Front-end diagnostics
- New utility: `src/utils/convexDiagnostics.js`
- Tracks:
  - duplicate active subscriptions (same query+args+route)
  - query render/re-result frequency
  - approximate payload size on result updates
  - hidden component subscriptions
- Enable in browser console:
  - `localStorage.setItem('ss_convex_diag', '1')`
  - reload
- Disable:
  - `localStorage.removeItem('ss_convex_diag')`

### Convex diagnostics
- `convex/projectSnapshots.ts` logs approximate snapshot payload bytes for read/write operations.
- Enable with env var: `CONVEX_USAGE_DIAGNOSTICS=1`

---

## Phase 2 follow-up

### What was changed
- Replaced presence/lock read patterns to use indexed range queries (`expiresAt > now`, `leaseExpiresAt > now`) and indexed cleanup of expired locks.
- Replaced project delete worker scan with indexed `projects.by_delete_after` lookup.
- Added new `projectAssets` indexes and narrowed library/deleted asset reads to index-backed queries.
- Changed batch asset signed-view pre-read from project-wide scan to targeted `db.get` reads for requested asset IDs only.
- Added optional role override support to `useCloudAccessPolicy` and used it in `CloudSyncCoordinator` to avoid duplicate `projects:getProjectById` subscription in that component.

### Why it was changed
- These were the highest-impact remaining low-risk paths where `.collect()` or duplicate subscriptions still caused avoidable read bandwidth and query churn.
- All changes keep existing feature behavior (collaboration, save/sync, asset flows, billing/admin checks) while narrowing read scope.

### Expected impact
- Lower read bandwidth for presence/locks in active collaboration projects (expired rows no longer fetched and filtered client-side in Convex functions).
- Lower background internal read cost for delete worker scheduling path.
- Lower bandwidth/function work for asset library + recently deleted lists, especially on projects with large asset histories.
- Lower function work for `assets:getAssetSignedViewsBatch` because it no longer reads every asset row in a project.
- One fewer duplicate `projects:getProjectById` subscription inside cloud sync coordinator flow.

### What still remains
- `projectSnapshots` remains monolithic payload storage/read model.
- `projects:listProjectsForCurrentUser` still performs per-project snapshot validation reads and can get chatty at scale.
- `billing:getMyEntitlement` is still subscribed from multiple surfaces; a shared route-level entitlement source is still pending.
- Admin overview queries still intentionally read broad table sets (acceptable for admin route, but heavy).

### Recommended Phase 3 priorities
1. Introduce lightweight snapshot metadata table/query path and keep heavy payload reads only on explicit open/apply actions.
2. Implement snapshot retention/pruning policy (autosave thinning, capped history, safe restore checkpoints).
3. Split home/project listing into light summary endpoints (no payload touches in hot path).
4. Add an app-shell entitlement/user context provider to fully dedupe repeated global policy queries.
5. Evaluate collaboration read model refinements (presence/locks summaries vs full rows) if live churn remains high after Phase 2.

---

## Phase 3B slice 1 follow-up (implemented)

### What was implemented
- Added `projectSnapshotHeads` metadata table and dual-write from `projectSnapshots:createSnapshot`.
- Added `projects:listProjectsForCurrentUserLite` to reduce snapshot-payload-coupled reads in list/home flows.
- Switched Home and Save/Sync cloud project list consumers to `listProjectsForCurrentUserLite`.

### Why it was changed
- The Phase 3A-selected first slice was to remove snapshot-driven list amplification first, without changing open/edit/collab architecture.

### Expected impact
- Fewer list-route reads that touch full latest snapshot payloads.
- Lower bandwidth/function cost for frequent cloud project list refreshes.
- Backward-compatible behavior kept via legacy fallback logic.

### What still remains
- Full payload still required for project open and remote snapshot apply.
- Autosave still writes full snapshot payload blobs.
- Global entitlement dedupe/provider consolidation remains future work.

### Manual QA checklist for this slice
1. Home cloud list renders expected projects and opens selected project.
2. Save/Sync project picker renders expected cloud projects and opens selected project.
3. Existing legacy projects without metadata heads still appear/open.
4. Cloud autosave/manual save still succeed and update snapshot id/status.
5. Collaboration/presence/locks unaffected.

### Rollback notes
- Revert UI queries to `projects:listProjectsForCurrentUser`.
- Keep `projectSnapshotHeads` additive schema/table in place; simply stop reading from it.

---

## Hotspot pass follow-up (snapshot chatter + asset bursts + live-model failure)

### Hotspots targeted
1. `projectSnapshots:getLatestSnapshotForProject` runtime chatter in open editor sessions.
2. Repeated asset signed-view calls for the same visible storyboard assets.
3. Background presence heartbeats when the script tab is hidden.
4. Live-model migration schema mismatch causing repeated ensure failures.

### Root causes
- Cloud sync coordinator was reactively subscribed to full latest snapshot payloads even when only latest snapshot id changes were needed.
- Signed URLs were requested repeatedly for the same asset IDs across re-renders/mounts.
- Presence heartbeat kept running on a fixed interval even in hidden tabs.
- Live-model normalization inserted `null` for optional string fields (`projectScenes`/`projectShots`) that expect `undefined`.

### Code changes made
- Switched cloud sync runtime from reactive full snapshot subscription to reactive snapshot-head metadata + on-demand full snapshot fetch when snapshot id changes.
- Added short-lived in-memory signed-view caching in `ShotGrid` and `ShotCard`, and re-used prefetched views before per-card fetches.
- Moved asset batch authorization into `getProjectAssetRowsForBatchRead` and removed separate `getAssetReadAuthorization` query call.
- Reduced presence heartbeat frequency and gated heartbeats when page visibility is hidden.
- Normalized live-model migration and live upsert payloads to use `undefined` for optional fields instead of `null`.

### Expected impact
- Fewer full-payload `projectSnapshots:getLatestSnapshotForProject` calls during steady-state editing.
- Fewer repeated asset signing calls for identical asset IDs in short windows.
- Lower background presence mutation/query churn when tabs are hidden.
- Fewer repeated `ensureStoryboardLiveModel` failures/retries due to schema mismatch.

### What still remains
- Full snapshot payload is still required for project-open and remote full-project apply paths.
- Asset signed URL generation still depends on short-lived URLs and may re-sign after cache expiry.
- Presence/lock queries are still expected while active collaboration UI is open.

### Manual QA for this pass
1. Open a cloud project and confirm updates still arrive (remote snapshot apply still works).
2. Scroll/open storyboard pages and verify images still load while asset signing call frequency drops.
3. Switch browser tab away/back while on script tab; verify presence still appears correctly after returning.
4. Open a project requiring live-model migration and confirm no repeated schema mismatch failures.

### Rollback notes
- Revert `CloudSyncCoordinator` head-based fetch effect to prior reactive latest snapshot query.
- Remove signed-view caches in `ShotGrid`/`ShotCard` if preview freshness regressions appear.
- Revert presence heartbeat interval/visibility gating to prior behavior if collaboration UX regresses.

---

## Hotspot pass follow-up #2 (live upsert no-op suppression + asset re-sign dedupe)

### Live-model churn found
- `syncLiveStoryboardState` was reading live rows then unconditionally issuing upserts for every scene/shot on each local edit-triggered sync call.
- This created avoidable write-after-read churn even when only one shot changed.
- Cloud sync runtime already had live query subscriptions mounted, but sync path still re-queried live scenes/shots as a separate read step.

### Asset churn found
- Shot cards could concurrently request the same `assets:getAssetSignedView` during rerenders/mount overlap.
- Library preview loading in `ShotCard` could re-request signed views for assets that were already in short-lived cache.
- Grid prefetches could duplicate batch signing requests for identical in-flight asset id sets.

### Code changed
- Added live payload normalization parity in `CloudSyncCoordinator` and skipped `upsertScene`/`upsertShot` when normalized payload + ordering already match persisted live rows.
- Reused existing live query subscription data as first source for sync diffing, with query fallback only when cache data is unavailable.
- Added dev-only diagnostics logging (`ss_convex_diag`) for live sync op mix (upserts vs skips vs deletes).
- Added signed-view in-flight dedupe in `ShotCard` so concurrent requests for the same asset ID share one action call.
- Updated `ShotCard` library preview load to use cache-first + missing-only batch signing.
- Added in-flight batch dedupe in `ShotGrid` for identical project/asset batch request keys.

### Expected impact
- **Function calls:** fewer `projectScenesLive:upsertScene` / `projectShotsLive:upsertShot` on no-op sync cycles; fewer duplicate asset signing calls during rapid rerenders/open flows.
- **Bandwidth:** reduced mutation traffic and lower repeated signed view payload responses.
- **Storyboard responsiveness:** lower background churn should reduce contention while preserving thumbnail/load behavior.

### Intentionally not changed
- No collaboration architecture rewrite.
- No live query granularity redesign by viewport/card visibility for scenes/shots in this slice.
- No server-side asset provider redesign or signed URL lifetime changes.

### Manual QA for this pass
1. Edit one shot field repeatedly and confirm only changed shot persists while storyboard remains responsive.
2. Edit scene metadata (slugline/location/etc.) and confirm updates persist and sync correctly.
3. Open storyboard image picker library multiple times and verify previews still resolve without visible regressions.
4. Switch between storyboard pages quickly and ensure thumbnails continue to load.
5. Validate collaboration, autosave/manual sync, and remote snapshot apply behavior still match current UX.

### Rollback notes
- Revert diff-skip logic in `CloudSyncCoordinator` if any missed live updates are observed.
- Revert signed-view in-flight dedupe/cache-first behavior in `ShotCard`/`ShotGrid` if preview freshness issues appear.

---

## Solo mode pass (collaborator-aware live sync throttling + asset tightening)

### What solo mode means here
- Solo mode is **not offline mode** and **not a second source of truth**.
- Solo mode means: if project presence indicates no other active collaborator, live storyboard upserts are buffered briefly in memory and flushed on a short timer or safety triggers.
- As soon as another collaborator is detected, buffered live edits flush immediately and normal real-time cadence resumes.

### What stayed live in solo mode
- Auth/user identity and project access checks.
- Project identity and snapshot-head freshness subscriptions.
- Presence subscription used as collaborator signal.
- Existing save/sync snapshot behavior.

### What became quieter
- `projectScenesLive:upsertScene` / `projectShotsLive:upsertShot` cadence is collaborator-aware:
  - collaborative mode: immediate write path
  - solo mode: short debounce buffer in-memory, latest payload wins
- Existing no-op upsert suppression still applies inside flush execution.
- Storyboard asset batch prefetch now uses a stable visible-set key to avoid harmless rerender refetches.
- Shot card asset fetch effects now key off stable cloud project id, reducing object-identity-triggered reruns.

### Buffering + collaborator-join flush behavior
- Pending live storyboard sync payload is held in-memory only (`pendingLiveSyncRef`).
- Flush triggers:
  1. solo debounce timer
  2. collaborator count rises above zero
  3. tab hidden / pagehide / beforeunload
- Failed flush keeps pending payload in memory for a later retry path.
- Project switch/unmount clears pending timer/buffer.

### Risks / limitations
- Presence is the current “working alone” signal; if collaborators are inactive in presence, mode can remain solo longer (safe because snapshot sync path remains intact).
- Buffer is in-memory only (no IndexedDB durability in this pass), chosen to keep risk low and behavior reversible.
- This pass intentionally does not redesign lock/presence architecture or full domain sync model.

### Expected impact
- **Function calls:** fewer live upsert calls during solo editing bursts.
- **Bandwidth:** lower repetitive live mutation traffic while alone.
- **Collaboration safety:** immediate flush on collaborator detection keeps shared editing behavior intact.

### Manual QA for this pass
1. Open cloud project in one tab, edit shots/scenes rapidly, verify normal UX and persisted edits.
2. While pending solo edits may exist, open second collaborator session and verify buffered changes flush and real-time behavior continues.
3. Trigger tab hide/pagehide and confirm no lost edits.
4. Verify manual save/autosave behavior still matches existing UX.
5. Verify storyboard thumbnails and library previews still load correctly.

### Rollback notes
- Remove solo debounce buffering branch in `CloudSyncCoordinator.syncLiveStoryboardState` and always call immediate flush path.
- Keep no-op suppression and asset cache tightening independently if needed.
