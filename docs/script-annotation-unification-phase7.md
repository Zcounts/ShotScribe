# Script Annotation Unification (Phase 7)

Phase 7 unifies Visualize shot-link references onto the same structured `scriptAnnotations` substrate used by breakdown annotations, while keeping existing visualize workflows stable.

## What changed

- Added shared annotation kinds:
  - `breakdown_annotation`
  - `shot_link_annotation`
  - `comment_annotation` (scaffolding only, no active UI in this phase)
- Added shot-link annotation helpers:
  - upsert by `shotId`
  - remove by `shotId`
  - migration from legacy shot range fields
  - index derivation by scene with fallback readers for legacy payloads
- Updated script derivation to build visualize link overlays from annotation entities first, with legacy shot-range fallback for historical data.
- Updated `linkShotToScene` to write shot-link annotations during link/unlink operations while preserving existing shot fields for compatibility.
- Updated Script tab to consume `derivedScriptData.compatibility.shotLinkIndexBySceneId` instead of recomputing shot links locally.

## Comment-ready rails (no UI launch)

- Added `comment_annotation` entity factory with:
  - stable id
  - anchor (`from`, `to`, `quote`)
  - `threadId`
  - status
  - comments array scaffold

This is intentionally data-model scaffolding only. Full comment UX and collaboration behaviors remain out of scope for Phase 7.

## Compatibility notes

- Existing storyboard shot fields (`linkedSceneId`, `linkedScriptRangeStart`, `linkedScriptRangeEnd`) are still written/read for backward compatibility.
- Legacy projects that only contain shot range fields are migrated into `shot_link_annotation` entities during script-state normalization.
- Derivation keeps fallback readers so visualize overlays continue to function for older payloads.
