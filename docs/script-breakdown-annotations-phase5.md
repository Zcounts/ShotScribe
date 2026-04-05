# Script Breakdown Annotations (Phase 5)

This phase migrates Script breakdown tagging to a hybrid annotation model.

## Implemented model

- Lightweight inline references on script document nodes (`attrs.breakdownRefIds`)
- Authoritative annotation entities stored in `scriptAnnotations`
- Category support for screenplay production breakdown use-cases (Props, Wardrobe, Makeup, Vehicles, Set Dressing, Stunts, SFX, VFX, Extras, Animals, Locations, Cast References, etc.)
- Derived list outputs:
  - per-scene breakdown lists
  - global breakdown lists

## Compatibility

- Legacy `scriptSettings.breakdownTags` is still supported via migration into structured `scriptAnnotations`.
- Derivation pipeline still emits adapter-compatible breakdown tags and aggregates for existing consumers.

## Current scope limits

- Script tab editor UI is not swapped yet.
- Comments are not part of this phase.
- Collaboration remains lock-first and snapshot-compatible.
