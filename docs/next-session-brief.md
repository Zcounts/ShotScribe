# Next Session Brief — Optimization Reset Baseline

**Date:** 2026-04-05  
**Audience:** front-end + Convex optimization session owner.

## 1) Current app status

### Stable areas
- Build is currently passing.
- Snapshot-head + lite-list path is live.
- Shared signed-view cache path is live for storyboard previews.
- Collaboration typing safety guard and solo buffering are live.

### Recently fixed regressions
- Legacy storyboard-live-model ensure failures (normalization/fallback path).
- Diagnostics-related startup instability.
- ShotCard duplicate signed-view symbol build break.

## 2) Biggest remaining usage problems

1. Full snapshot payload dependence still drives expensive save/open behaviors.
2. Collaboration/reactive query surfaces are still sizable in active cloud sessions.
3. CloudSyncCoordinator remains a dense convergence point for sync logic and side effects.

## 3) Current likely hotspots

- Snapshot create/read paths under sustained editing.
- Presence/locks/members + freshness subscriptions during collaboration.
- Route/component boundaries where identical policy/query state can still be owned more than once.

## 4) What has already been tried

- Duplicate subscription cleanup in ShotCard/ShotGrid and SaveSync panel gating.
- Snapshot-head metadata read model + lite project list query.
- Signed-view cache + in-flight dedupe + batch ID dedupe.
- Solo-mode debounce/no-op suppression and typing hot-window protections.

## 5) What helped

- Reduced obvious fanout and hidden subscriptions.
- Reduced duplicate asset signing calls.
- Improved collaboration typing stability.
- Reduced list/status coupling to full snapshot payload reads.

## 6) What did NOT materially solve scaling alone

- Additional micro-dedupe without changing higher-level data-flow boundaries.
- Isolated cache tweaks without ownership-model changes.

## 7) Constraints / things not to break

- Local-first save trust and clear save/sync UX.
- Billing/auth/admin behavior.
- Desktop↔mobile cloud continuity.
- Collaboration correctness (no silent clobber/data loss).

## 8) What should probably be rethought architecturally

- How often active cloud editing depends on full snapshot payload rewrites.
- Where query ownership should live (provider/route-level vs many child components).
- Whether one hot domain should exit full-snapshot write path while snapshots remain backup/history.

## 9) Recommended next focus

1. Run fresh measurement on current baseline (short, targeted).
2. Make a go/no-go decision quickly:
   - If usage is still high for one active user, start one **targeted domain extraction** prototype.
   - If usage is acceptable, continue incremental ownership/gating cleanup only.
3. Keep changes feature-flagged and rollbackable.

## 10) Do not waste time re-investigating these solved issues

- The specific ShotCard duplicate `getCachedSignedView` symbol build failure.
- The legacy ensureStoryboardLiveModel payload-shape failure class.
- The old per-shot project-wide asset subscription fanout pattern.

(Only revisit if new evidence shows a regression.)
