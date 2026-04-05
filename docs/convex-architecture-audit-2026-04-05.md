# Convex Architecture Audit (Read/Reconcile Pass)

Date: 2026-04-05

## 1. Current state reconciled

ShotScribe is no longer in the pre-fix “subscription chaos” state, but it is still architecturally expensive for long single-user cloud sessions.

What is actually true now:
- Snapshot-head metadata exists and is written on every snapshot create; cloud freshness checks use the head query first.
- Home/SaveSync cloud lists use the lite project-list query.
- Storyboard asset signed-view calls were consolidated around a shared client cache + batch path.
- SaveSync panel collaboration queries are visibility-gated by panel open state.
- Solo-mode buffering for live storyboard mutations exists and is driven by presence.
- **But** the core cloud save path still writes full snapshot payloads on a timer, and open still hydrates full snapshot payload.
- **But** CloudSyncCoordinator still carries many always-on subscriptions/mutations and does cross-domain orchestration in one component.
- **But** script collaboration heartbeat/presence/lock traffic is still always active for any cloud project open in Script tab, regardless of actual collaborator presence.

## 2. What was already fixed / tried

Completed and visible in code:
- Snapshot-head table/query path (`projectSnapshotHeads`, `getLatestSnapshotHeadForProject`) and write-through from snapshot creation.
- Lite cloud list read path (`listProjectsForCurrentUserLite`) wired into Home and Save/Sync.
- Signed-view cache + in-flight dedupe helper and batch signed-view action path.
- Save/Sync panel gating for list/members/presence/locks queries.
- Solo-mode live storyboard buffering with collaborator hold window + flush triggers.
- Deferred remote live apply while local edits are hot (`lastStoryboardEditAt` window).

Notable partial work (real but incomplete):
- Live storyboard extraction exists (`projectScenes` / `projectShots` tables + upsert/delete sync), but snapshot remains the authoritative large write/read primitive.
- Metadata-first list logic is present, but list query is still non-paginated and does per-project head lookups (N+1 pattern).

## 3. Stale assumptions / things not to re-litigate

Do not spend another pass re-solving these unless new regressions are proven in code/runtime:
- “ShotCard signed-view helper collision is unresolved.” (fixed via shared helper usage path).
- “Save/Sync panel always mounts collaboration subscriptions.” (already gated by `open`).
- “No snapshot-head model exists.” (exists and is wired).
- “Storyboard image signing is still per-shot waterfall by default.” (batch prefetch + cache is present).
- “Solo-mode does not exist.” (it exists; issue now is architectural ceiling, not absence).

## 4. Biggest remaining usage hotspots

Ranked high → low impact:

1) **Full snapshot writes remain in hot edit path**
- What it is: every cloud sync flush serializes + writes full project payload.
- Why expensive: payload-size amplification + frequent writes for single-user typing/edit bursts.
- Affects: single-user and multiplayer.
- Fix type: **redesign** (not another trim).

2) **CloudSyncCoordinator is still a multi-subscription convergence hub**
- What it is: one component owns project, presence, live scenes/shots, snapshot head, remote fetch/apply, image backfill, mode switching.
- Why expensive: persistent reactive surface + cross-domain side effects on every open cloud project.
- Affects: both (single-user pays baseline overhead even without collaborators).
- Fix type: **redesign + gating split**.

3) **Script tab collaboration traffic runs even when user is effectively solo**
- What it is: 6s heartbeat + presence + lock queries for any cloud project in Script tab.
- Why expensive: steady background writes/reads despite no collaborator.
- Affects: mostly single-user cloud sessions.
- Fix type: **gating** (automatic “collab-active only” mode).

4) **Project-list and project-open are not fully metadata-first yet**
- What it is: list query fetches all projects with per-row head lookups; open loads full latest snapshot payload.
- Why expensive: no pagination, N+1 head reads, full payload on every open.
- Affects: both; especially users with many projects.
- Fix type: **trim + redesign boundary**.

5) **Storyboard/library queries still over-fetch for visibility scope**
- What it is: library queries request up to 120 assets and are mounted on storyboard surfaces; signed URL generation still per-asset in batch action.
- Why expensive: high payload/read count for projects with large media libraries.
- Affects: both.
- Fix type: **trim + visible-only pipeline refinement**.

## 5. Evaluation of the four architecture goals

### Goal A — single-user local draft / buffer for editor surfaces
- Current fit with codebase: High (local-first store already exists; cloud sync is already debounced).
- Expected usage reduction: **Very high** (cuts both snapshot write frequency and live upsert churn in solo sessions).
- Risk / complexity: Medium-high (needs clearer draft/commit boundaries per editor surface).
- Optimization vs redesign: **True redesign** of write ownership.
- Reduces: writes, reads triggered by writes, subscription churn side-effects, payload volume.
- Root cause vs symptom: **Root cause** (hot-path cloud persistence coupling).
- Recommendation level: **High**.

### Goal B — collaborative mode only when another user is actually present
- Current fit with codebase: Medium-high (presence + solo-mode primitives already exist).
- Expected usage reduction: High for solo cloud sessions; moderate overall.
- Risk / complexity: Medium (presence lag/false negatives must be handled safely).
- Optimization vs redesign: Mostly gating, some behavior redesign.
- Reduces: subscriptions, heartbeats, lock/presence writes, some live mutation traffic.
- Root cause vs symptom: Mixed (addresses major symptom, partly root for collaboration overhead).
- Recommendation level: **High**.

### Goal C — visible-only storyboard / media preview pipeline
- Current fit with codebase: Medium (batch + cache exists; can extend to viewport/page-keyed fetching).
- Expected usage reduction: Medium.
- Risk / complexity: Low-medium.
- Optimization vs redesign: Optimization layer.
- Reduces: reads, signed-url actions, payload size.
- Root cause vs symptom: Mostly symptom.
- Recommendation level: **Medium**.

### Goal D — project-open and list screens metadata-first + paginated
- Current fit with codebase: Medium (lite list + snapshot head groundwork exists).
- Expected usage reduction: Medium-high for high-project-count users; lower for active editing sessions.
- Risk / complexity: Medium.
- Optimization vs redesign: Mostly trim with selective redesign.
- Reduces: list reads, payload size, open-time cost.
- Root cause vs symptom: Important, but secondary to hot edit write model.
- Recommendation level: **Medium-high**.

## 6. Recommended next architecture target

**Primary next target: Replace full-snapshot hot-path writes with a local-draft + bounded cloud commit model for storyboard/script edit surfaces (single-user first), while keeping snapshots as checkpoint/history.**

Why this is the next best move:
- It attacks the dominant root cost that remains after earlier dedupe/gating passes: full payload cloud writes as routine edit behavior.
- It should cut the biggest usage bucket (write volume + downstream reactive churn), not just shave edge calls.
- Current live-scene/live-shot extraction already provides a landing zone for bounded domain commits; use that instead of layering more heuristics around full snapshots.

Expected usage cut:
- Large reduction in cloud writes during solo editing.
- Secondary read/subscription reduction from fewer snapshot-head changes and fewer remote apply cycles.

What likely needs rework/replacement:
- CloudSyncCoordinator responsibilities (split into smaller services; remove “everything in one reactive orchestrator” pattern).
- Store cloud flush contract (`flushCloudSync`) so full snapshot writes become explicit checkpoints, not default edit cadence.

What should wait until after this pass:
- Full metadata pagination overhaul for all list surfaces.
- Deeper media pipeline refinements beyond simple visibility gating.
- Retention/pruning policy tuning.

Path type:
- **Evolutionary but redesign-level** (replace write boundary, keep product UX and snapshot backup semantics).

## 7. Suggested scope for the next implementation pass

- Introduce one editor-domain “local draft → bounded cloud commit” pipeline behind a feature flag (storyboard first).
- Keep snapshot writes only for explicit checkpoint events (manual save, lifecycle checkpoints, collaborator-safe boundaries).
- Auto-gate script presence/lock/heartbeat traffic to collaborator-active contexts only.
- Add measurement counters (writes/min, snapshot bytes/session, presence heartbeats/session) to verify reduction before expanding to other domains.
