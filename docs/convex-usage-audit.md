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

