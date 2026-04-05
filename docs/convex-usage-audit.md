# Convex Usage Audit — Current Baseline

**Last updated:** 2026-04-05  
**Purpose:** single source of truth for what is confirmed, what is inferred, and what is still unknown before the next optimization session.

---

## 1) Current reality snapshot (confirmed)

ShotScribe is in a **partially optimized** state:

- Several meaningful read/fanout fixes have landed (asset subscription consolidation, lighter project list path, snapshot-head metadata path, live typing guards).
- Recent regressions from these changes were fixed (storyboard live-model migration failures, diagnostics-related startup issues, and a later ShotCard build symbol collision).
- The app is currently buildable and functionally stable for baseline flows, but Convex usage for active cloud projects can still be too expensive for long sessions.

This means the next session should not repeat low-level dedupe work blindly; it should validate whether a few **core data-flow patterns** still dominate cost.

---

## 2) What landed and is still true (confirmed)

### A. Snapshot-head + lightweight list path
- `projectSnapshotHeads` exists and is dual-written from snapshot creation.
- `projectSnapshots:getLatestSnapshotHeadForProject` exists and is used by cloud sync coordinator freshness checks.
- `projects:listProjectsForCurrentUserLite` exists and is used in Home + Save/Sync cloud list surfaces.

**Net:** list/status reads are less coupled to full snapshot payload reads than before.

### B. Storyboard asset preview/signing churn reduction
- Shared signed-view helper module is in place (`assetSignedViewCache`) with short-lived cache + in-flight dedupe (single + batch).
- Shot-grid/card/project-properties flows use the shared helper path.
- Convex batch signing path dedupes duplicate asset IDs before read/sign steps.

**Net:** duplicate short-window signing calls are reduced versus earlier fanout behavior.

### C. Collaboration/live typing safety work
- Local text edit timestamps (`lastStoryboardEditAt`) are tracked.
- CloudSyncCoordinator defers remote apply while local edits are active/hot.
- Solo-mode buffering + no-op suppression remain active for live storyboard upserts.

**Net:** prior one-letter/clobber issues were reduced without removing collaboration convergence.

### D. Collaboration query-scope cleanup
- Save/Sync panel collaboration-heavy queries are gated by panel visibility.
- Some previously duplicated identity/policy query paths were narrowed.

**Net:** fewer always-on hidden subscriptions than pre-pass state.

---

## 3) Regressions that occurred and status (confirmed)

1. **Storyboard live-model ensure failures on legacy payload shapes**  
   - Root cause was legacy snapshot shape mismatch in ensure path.  
   - Fixed by server-side normalization path and safer diagnostics.

2. **Diagnostics-related startup/boot crash issues**  
   - Root cause was diagnostics path causing runtime instability in some startup conditions.  
   - Fixed in subsequent narrow pass (diagnostics kept but safer).

3. **CI/prod build break in `ShotCard.jsx` (`getCachedSignedView` duplicate symbol)**  
   - Root cause was duplicate symbol declaration/collision in signed-view helper usage context.  
   - Fixed by consolidating to one canonical shared helper path and removing naming collision risk.

---

## 4) What helped vs what did not fully solve cost

### Helped materially (confirmed)
- Per-surface subscription consolidation (especially project-wide asset queries).
- Hidden-query gating in Save/Sync and modal-like UI paths.
- Snapshot-head/lite-list split for metadata-first project list reads.
- Signed-view request dedupe and cache sharing across storyboard surfaces.

### Helped quality/stability more than cost (confirmed)
- Typing hot-window safeguards and deferred live apply.
- Legacy payload normalization in ensure migration path.

### Did **not** fully solve scaling alone (confirmed)
- Repeated low-level query dedupe/refinement without revisiting bigger data-flow boundaries.
- Minor cache tweaks in isolation.

---

## 5) Biggest remaining usage/scaling concerns

## 5.1 Confirmed concerns
1. **Full snapshot payload still exists as major write/read primitive in cloud save/open paths.**  
   Even with snapshot-head metadata, active editing still frequently serializes large payloads.

2. **Live collaboration surfaces still maintain non-trivial reactive query sets.**  
   Presence/locks/members + project freshness subscriptions can still stack up in long sessions.

3. **CloudSyncCoordinator remains a high-complexity convergence point.**  
   It carries debounce, deferred apply, head checks, and fallback logic in one place.

## 5.2 Inferred (needs fresh measurement)
- Some per-route query ownership may still be too fragmented (same policy data owned by multiple components).
- Snapshot payload size growth may now be a bigger limiter than raw call-count in some projects.

## 5.3 Hypotheses for next session
- A bigger win likely requires reducing full-snapshot dependence for hot edit domains, not just more dedupe.
- Route/provider-level query ownership could reduce residual duplicate subscriptions more than component-level tweaks.

---

## 6) Architecture ideas explored vs adopted

### Adopted in production code
- Metadata-first read model for “latest snapshot head”.
- Lightweight project list query path.
- Shared asset signed-view cache and batch dedupe.
- Collaborator-aware solo-mode buffering + typing safeguards.

### Explored but not fully adopted
- Broader domain extraction away from full snapshot writes (beyond current live storyboard model).
- Strongly centralized app-level query ownership/provider model.
- Aggressive snapshot retention/pruning strategy tied to operational budgets.

---

## 7) Constraints for future work (do not break)

1. Local-first editing behavior and user trust in save status.
2. Billing/auth/admin behavior and entitlement gating.
3. Desktop ↔ mobile cloud continuity for paid users.
4. Collaboration correctness (no silent clobber, no hidden data loss).
5. Storyboard image/library behavior now stabilized by shared cache path.

---

## 8) Deferred intentionally

- Any broad rewrite of storage model in this pass.
- Any rewrite of collaboration protocol/merge semantics in this pass.
- Any user-facing workflow changes unrelated to optimization baseline cleanup.

---

## 9) Living-doc map after this consolidation

## 10) 2026-04-05 read-bandwidth hardening pass (confirmed)

- Presence probe now uses a lightweight one-shot query (`presence:getPresenceProbe`) and only mounts `presence:listProjectPresence` after collaborator detection; solo sessions keep presence fully unmounted.
- CloudSyncCoordinator snapshot hydration now compares `getLatestSnapshotHeadForProject` against the locally known snapshot lineage and skips `getLatestSnapshotForProject` when IDs match.
- S3 client initialization moved to module-level reuse, and signed-view payloads now expose URL expiry timestamps consumed by the client cache.
- Client signed URL cache now respects server expiry and tracks cache hit/miss metrics to catch first-load race/miss regressions.
- Confirmed no active frontend call sites for `projects:listProjectsForCurrentUser` (heavy list query); Lite remains the only list path.

## 11) 2026-04-05 idle-traffic cleanup follow-up (confirmed)

- Presence probe scheduler now enforces a 30s quiet period after project open, then polls at 60s until a collaborator is ever detected in-session; only then does it use the 30s cadence.
- Live storyboard table reads (`projectScenesLive:listScenesByProject`, `projectShotsLive:listShotsByProject`) now run as one-shot reads in solo mode and switch to reactive subscriptions only when collaborator mode is active.
- Signed URL client reads now route exclusively through the batch action path in coordinator/card/properties flows; single-item fetches use the batch helper with one asset ID.
- Periodic checkpoint timer now no-ops when both domains are clean and no domain commits happened since the last snapshot timestamp.

- **Primary source of truth:** `docs/convex-usage-audit.md` (this file)
- **Architecture options:** `docs/convex-phase3-plan.md` (trimmed to current strategic choices)
- **Solo/collab runtime notes:** `docs/solo-mode-plan.md` (trimmed, focused)
- **Next session kickoff:** `docs/next-session-brief.md`

Deprecated ad hoc optimization notes were removed to avoid conflicting sources of truth.

---

## 10) Immediate next-session guidance

Start with measurement against current code (not old assumptions), then decide quickly whether the next step is:
1) one more narrow query ownership cleanup, or  
2) a targeted architectural shift away from full snapshot payload dependence for one hot domain.

If one active user still burns too much usage after current fixes, choose (2).
