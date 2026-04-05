# Convex Phase 3 Plan (Architecture & Migration)

Date: 2026-04-05  
Scope: Web app + Convex backend only (mobile intentionally out of scope for this planning phase).

## 1) Executive summary

Phase 1–2 removed a lot of avoidable churn, but the dominant cost center is still architectural: **full-project snapshots are used as both backup/history and an active read/write path**.

Today, cloud save and project-open paths still read/write a full snapshot payload blob that includes scenes, shots, schedule, callsheets, cast/crew, script docs, and UI settings. That means:
- many writes are “rewrite whole project” writes,
- several reads are expensive only because they touch snapshot payload existence,
- project list flows still do per-project snapshot payload validation.

The recommended Phase 3 direction is **not** a big-bang rewrite. It is a staged migration to:
1. keep snapshots as backup/history,
2. introduce lightweight snapshot/project summary metadata,
3. switch list/home/status reads to metadata-only,
4. keep heavy payload fetches only on explicit project-open/editor entry,
5. optionally split one high-value domain write path after those wins land.

---

## 2) Current snapshot/data-flow problems

### 2.1 What exactly is stored in snapshots today

`getProjectData()` builds a large payload with most app state:
- project identity and theme,
- storyboard scenes/shots (including many shot fields),
- schedule blocks,
- callsheets,
- cast/crew + notes,
- script document + script scenes + annotations + script settings,
- per-tab/view preferences and other UI-ish state.

See payload construction in `store.getProjectData()`.  
Source: `src/store.js` lines 2736–2944.

Snapshots are written by `projectSnapshots:createSnapshot` with `payload: v.any()` and linked as `projects.latestSnapshotId`.  
Source: `convex/projectSnapshots.ts` lines 18–79.

### 2.2 Which screens/functions need full payload vs lightweight metadata

**Need full payload now (or currently coded that way):**
- Cloud project open: `openCloudProject` loads latest snapshot payload and calls `loadProject(payload)`.  
  Source: `src/store.js` lines 3871–3913.
- Remote collaborator apply path: `CloudSyncCoordinator` subscribes to latest snapshot and passes full payload to `applyIncomingCloudSnapshot`.  
  Source: `src/components/CloudSyncCoordinator.jsx` lines 73–76 and 312–319.
- Cloud save/autosave: `flushCloudSync` serializes full `getProjectData()` and calls snapshot mutation.  
  Source: `src/store.js` lines 4229–4279.

**Only need lightweight metadata (currently heavier than needed):**
- Project list/home cloud cards: `projects:listProjectsForCurrentUser` is list-focused, but still validates by loading latest snapshot payload per project.
  Source: `convex/projects.ts` lines 300–356.
- Save/sync status and app shell policy states need snapshot/version metadata (id/time/source/size) more than full payload.

### 2.3 Expensive reads due to latest snapshot/full payload coupling

1. `projects:listProjectsForCurrentUser` calls `ctx.db.get(project.latestSnapshotId)` and checks `latestSnapshot?.payload` for each candidate project, with fallback query to `projectSnapshots`.
   Source: `convex/projects.ts` lines 345–356.

2. `getLatestSnapshotForProject` returns full snapshot docs (including payload) and is used by cloud-open and cloud-sync coordinator paths.
   Source: `convex/projectSnapshots.ts` lines 111–149, `src/data/repository/cloudProjectAdapter.js` lines 118–128.

### 2.4 Expensive writes that rewrite full project payload

`flushCloudSync` always builds and writes the full safe payload snapshot for manual save/autosave, even if only one field changed.  
Source: `src/store.js` lines 4271–4279.

### 2.5 “Live state” behavior still tied to snapshot-shaped data

- Conflict detection and sync state key off `expectedLatestSnapshotId` and snapshot id progression.
  Source: `src/store.js` lines 4278–4295, `convex/projectSnapshots.ts` lines 44–53.
- Remote updates arrive as full latest snapshot payload and are applied wholesale.
  Source: `src/components/CloudSyncCoordinator.jsx` lines 312–319.

### 2.6 Best seams for progressive extraction

There are already strong seams to exploit:
1. **`projects` table already stores lightweight identity + latestSnapshotId** (good anchor for summary metadata).
2. **Live storyboard model already exists** (`projectScenes`/`projectShots`) and can continue to absorb storyboard reads/writes without snapshot dependence.  
   Source: `src/components/CloudSyncCoordinator.jsx` lines 65–72 and 283–288.
3. **Cloud snapshot payload sanitizer already centralizes snapshot shaping**, making it a good insertion point for metadata derivation.
   Source: `src/data/repository/cloudSnapshotPayload.js` lines 73–83.

---

## 3) What is expensive and why

1. **Blob-based write amplification:** full payload rewritten on every sync/autosave.
2. **List read amplification:** list query does per-project payload existence checks.
3. **Reactive heavy-read coupling:** latest snapshot subscription is payload-bearing even when only version/freshness is needed.
4. **Dual-model overlap cost:** live storyboard entities exist, but snapshot remains the universal fallback read model for open/sync.

---

## 4) Proposed target architecture

### 4.1 Data model (practical middle ground)

Keep:
- `projects`: ownership, identity, lifecycle, and latest pointers.
- `projectSnapshots`: immutable backup/history payloads for restore/export/recovery.

Add:

1. `projectSnapshotHeads` (new table, 1 row per project)
   - `projectId`
   - `latestSnapshotId`
   - `latestSnapshotCreatedAt`
   - `latestSnapshotSource`
   - `latestSnapshotVersionToken`
   - `latestSnapshotPayloadBytes`
   - `latestSnapshotHasPayload` (bool)
   - `updatedAt`

2. `projectSummaries` (new table, 1 row per project; lightweight)
   - `projectId`
   - identity + role-friendly fields for list cards (`name`, `emoji`, `updatedAt`, `pendingDeleteAt`, etc.)
   - health flags (`hasAnySnapshot`, `hasLiveStoryboard`, `isCorruptOrNeedsRepair`)
   - optional quick counts (`sceneCount`, `shotCount`) when cheaply available

These two tables are denormalized read models optimized for hot reads; source of truth remains `projects` + snapshots/live entities.

### 4.2 Metadata vs heavy payload boundaries

**Metadata (reactive):**
- list/home cards
- save/sync freshness indicators
- “last synced”/“source”/“size”
- conflict checks based on latest snapshot id/token

**Heavy payload (on-demand):**
- project-open hydration when local cache not sufficient
- restore history entry fetch
- export/recovery snapshots

### 4.3 Query strategy

Reactive:
- `projects:listProjectsForCurrentUserLite` (no snapshot payload reads)
- `projectSnapshots:getLatestSnapshotHead` (metadata only)
- existing live storyboard queries for storyboard collaboration

On-demand:
- `projectSnapshots:getSnapshotPayloadById` (or current full latest snapshot query only when opening/reloading)

### 4.4 Autosave under target model

Keep current UX/flow:
- local-first save remains unchanged,
- cloud autosave still creates snapshots,
- but each write also updates lightweight head row (metadata),
- most UI freshness checks read head metadata, not full payload.

### 4.5 Backward compatibility model

- If `projectSnapshotHeads` / `projectSummaries` missing for old projects, queries fall back to current logic once and backfill rows.
- Keep current snapshot mutation as canonical writer while dual-writing new metadata rows.
- No immediate deletion of existing snapshot read paths.

---

## 5) Migration stages (safe rollout)

## Stage 1 — Introduce snapshot head + summary read models (dual-write)
- **Change:** add new tables + indexes; on snapshot create, write/update `projectSnapshotHeads`; backfill lazily.
- **Impact:** medium usage reduction (metadata available for cheap reads).
- **Risk:** low-medium (dual-write consistency).
- **Compatibility:** full backward compatible; fallback to old logic if head missing.
- **Rollback:** disable reads from new tables behind flag; keep old queries.
- **Verify:** compare latest snapshot id/timestamps between `projects` and `projectSnapshotHeads` for sampled projects.

## Stage 2 — Switch project list/home to metadata-only reads
- **Change:** replace `projects:listProjectsForCurrentUser` payload validation with `projectSummaries` / head checks.
- **Impact:** high read-bandwidth reduction on home/list surfaces.
- **Risk:** low-medium (list correctness).
- **Compatibility:** fallback to old list path when summary missing.
- **Rollback:** route list query back to old implementation.
- **Verify:** list parity checks (same projects visible, same ordering rules).

## Stage 3 — Shift freshness/conflict status reads to snapshot head
- **Change:** Save/Sync and cloud coordinator use head metadata for version/freshness checks where payload isn’t required.
- **Impact:** medium reduction in reactive churn and unnecessary payload coupling.
- **Risk:** medium (sync semantics).
- **Compatibility:** continue fallback to full latest snapshot query when needed.
- **Rollback:** re-enable old latest snapshot dependency.
- **Verify:** conflict paths still block and resolve correctly.

## Stage 4 — Optional targeted domain extraction (single domain)
- **Change:** choose one high-value domain (recommended: script document OR schedule) to avoid full snapshot rewrites for that domain’s frequent edits.
- **Impact:** potentially high write + read savings in active editing sessions.
- **Risk:** medium-high (domain semantics).
- **Compatibility:** continue writing snapshots for backup while primary live edits use extracted table.
- **Rollback:** feature-flag off extracted writer, keep snapshot-only write path.
- **Verify:** domain-specific regression suite + collaborator conflict tests.

## Stage 5 — Deprecate heavy paths when parity proven
- **Change:** remove payload-dependent validation in hot list/status flows; retain snapshot payload for open/restore/export.
- **Impact:** sustained reduction in DB bandwidth and function-call load.
- **Risk:** medium (cleanup mistakes).
- **Compatibility:** deprecate only after telemetry parity window.
- **Rollback:** keep old query endpoints until full confidence window ends.
- **Verify:** Convex usage trend + functional parity dashboards.

---

## 6) Recommended first implementation slice for Phase 3B

**Recommended first slice:**

> **Introduce `projectSnapshotHeads` + `projects:listProjectsForCurrentUserLite`, then switch Home/SaveSync cloud project lists to metadata-only reads (no per-project payload validation).**

Why this is best first:
- **High impact:** directly addresses current per-project snapshot payload-touch behavior in list flows.
- **Low risk:** does not change editing model, autosave model, collaboration locks/presence, or asset flows.
- **Progressive:** creates foundation for later stages without forcing domain-level rewrite.
- **One-session feasible:** schema + dual-write + one list query + limited UI query switch.

---

## 7) Risks / rollback notes

Key risks:
- metadata drift between snapshots and head/summary tables,
- edge cases on legacy projects with missing heads,
- ordering/filter parity issues on home/list.

Mitigations:
- dual-write in mutation path + lazy backfill fallback,
- feature flags for new list/head reads,
- side-by-side parity logging in DEV/staging,
- reversible query switches.

---

## 8) Manual QA checklist

1. Cloud project open still loads correct content.
2. Autosave/manual save still writes and updates save/sync state.
3. Collaboration conflict flow (version conflict) still blocks/recovers.
4. Save/Sync panel cloud project list matches old behavior (count/order/roles).
5. Home cloud projects and pending deletion sections show same projects as pre-change.
6. Presence/locks remain correct while editing script.
7. Asset library and storyboard image flows unaffected.
8. Billing-gated users still see expected cloud restrictions.
9. Admin console unaffected (not in scope, but smoke check route access).

---

## 9) Metrics to watch in Convex before/after

Primary:
- Database Bandwidth (read bytes)
- Query function calls
- Top function bandwidth by component prefix

Function-level focus:
- `projects:listProjectsForCurrentUser` (or new lite query)
- `projectSnapshots:getLatestSnapshotForProject`
- any new `projectSnapshotHeads:*` functions

Secondary:
- snapshot payload bytes logged (existing diagnostics)
- median/95p project-open latency
- conflict/retry rate in cloud sync

Success signal for Phase 3B first slice:
- measurable drop in list-route query bytes/calls without any regression in project visibility/order and no change in editor/collaboration behavior.

---

## Phase 3B slice 1 implementation status (completed)

### What was implemented
- Added `projectSnapshotHeads` table as a lightweight latest-snapshot metadata read model.
- Updated `projectSnapshots:createSnapshot` to dual-write/update `projectSnapshotHeads`.
- Added `projectSnapshots:getLatestSnapshotHeadForProject` compatibility query (returns lightweight head and legacy fallback shape).
- Added `projects:listProjectsForCurrentUserLite` and switched Home + Save/Sync cloud project lists to this metadata-first list query.

### What is still left for later slices
- Save/Sync/cloud coordinator freshness/conflict reads still use full latest snapshot docs where payload is needed.
- Project-open still fetches full latest payload (intentional for this slice).
- No domain-level extraction (script/schedule/etc.) yet.

### Manual QA for this slice
1. Home cloud project list still shows expected projects/order and role labels.
2. Save/Sync project picker still lists/open projects correctly.
3. Opening existing legacy cloud projects still works.
4. New saves create snapshots and continue to sync/resolve conflicts correctly.
5. Collaboration presence/locks and script editing behavior remain unchanged.

### Rollback notes
- Frontend rollback: switch Home/SaveSync queries back to `projects:listProjectsForCurrentUser`.
- Backend rollback: leave `projectSnapshotHeads` in schema but stop reading it; old list query path remains intact.

---

## Post-slice hotspot pass (runtime chatter reduction)

### What was implemented
- Replaced always-live full latest snapshot subscription in cloud sync runtime with snapshot-head metadata subscription and on-demand full snapshot fetch only when snapshot id changes.
- Added short-lived per-session signed-view caches in storyboard flows (`ShotGrid`, `ShotCard`) and prioritized prefetched views over per-card refetch.
- Removed separate `assets:getAssetReadAuthorization` hop by moving auth into `getProjectAssetRowsForBatchRead`.
- Gated script presence heartbeat by document visibility and reduced interval to cut hidden-tab churn.
- Fixed live-model payload normalization (`null` -> `undefined`) for optional fields to prevent repeated `ensureStoryboardLiveModel` schema failures.

### What remains for later slices
- Project-open path still hydrates from full snapshot payload.
- Remote non-storyboard domains (script/schedule/etc.) still depend on full snapshot apply semantics.
- Broader snapshot architecture split (metadata vs domain entities) remains staged work.

### Manual QA additions for this pass
1. Home + Save/Sync list still function and open projects correctly.
2. Cloud project open + remote snapshot apply still work.
3. Script tab presence still updates after tab visibility changes.
4. Storyboard image previews still resolve correctly with caching enabled.
5. Live-model migration no longer loops on schema mismatch for optional fields.

### Rollback notes
- Restore prior latest-snapshot reactive query in `CloudSyncCoordinator` if remote-update behavior regresses.
- Disable signed-view caching by removing cache map usage if signed URL freshness issues appear.
- Revert visibility-gated heartbeat if collaborator presence feels delayed.

---

## Post-slice hotspot pass #2 (live no-op write suppression + asset request dedupe)

### Implemented in this pass
- Added client-side diff guards in `CloudSyncCoordinator.syncLiveStoryboardState` so live scene/shot upserts only run when normalized payload/order meaningfully changed.
- Reused mounted live query data for sync comparison before falling back to direct list queries.
- Added temporary dev diagnostics (`ss_convex_diag`) for live sync operation counts (upsert/skip/delete mix).
- Added `ShotCard` signed-view in-flight dedupe keyed by asset id.
- Updated `ShotCard` library preview loading to cache-first and batch only missing asset IDs.
- Added `ShotGrid` in-flight batch dedupe for identical project+asset signing batches.

### Remaining hotspots
- Live scene/shot list subscriptions still represent full-project live docs (expected for current collaboration model).
- Storyboard assets still require re-signing after TTL expiry by design.
- Some `assets:getAssetView` legacy fallback paths remain for non-S3/legacy providers.

### Manual QA additions
1. Repeated shot edits should persist correctly without visible regressions.
2. Repeated scene metadata edits should persist and reflect across collaborators.
3. Storyboard thumbnail previews should remain stable during fast navigation.
4. Opening the library picker repeatedly should not degrade preview load behavior.

### Rollback notes
- Remove diff-skip logic if any stale live row issue is observed.
- Remove in-flight dedupe maps in `ShotCard`/`ShotGrid` if they mask legitimate refreshes.

---

## Solo mode runtime pass (phase 3 controlled optimization)

### Implemented
- Added collaborator-aware live storyboard sync mode switching in `CloudSyncCoordinator`:
  - **Collaborative mode:** immediate live sync writes.
  - **Solo mode:** short in-memory debounce queue, latest payload flush.
- Presence rows are now consumed as the primary “alone vs collaborative” runtime signal.
- Added safety flush triggers for pending solo writes:
  - collaborator joins
  - `visibilitychange` -> hidden
  - `pagehide` / `beforeunload`
- Retained existing no-op upsert suppression during flush execution.
- Tightened storyboard asset effects:
  - stable visible-asset set key in `ShotGrid`
  - stable cloud project id keyed effects in `ShotCard`

### Intentionally deferred
- Durable local queue (IndexedDB) for crash recovery.
- Presence/lock system redesign.
- Any broader shift away from snapshot-centric save flow.

### Expected impact
- Reduced live mutation chatter during solo edit bursts.
- Maintained collaboration correctness by immediate flush on collaborator detection.
- Reduced unnecessary asset refetch from benign rerenders.

### Manual QA additions
1. Solo edit burst: verify no visible behavior change and successful persistence.
2. Join collaborator mid-edit: verify pending writes flush and live behavior continues.
3. Hide tab / close tab while editing: verify pending writes flush path runs.
4. Storyboard previews and library picker remain stable.

### Rollback
- Revert collaborator-aware debounce branch in `CloudSyncCoordinator`.
- Keep or rollback asset effect stabilization independently.
