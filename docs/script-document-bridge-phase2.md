# Script Document Bridge (Phase 2)

This phase introduces a compatibility bridge for the Script tab migration to a ProseMirror-style canonical document model.

## What was added

- `src/features/scriptDocument/legacyBridge.js`
  - Converts legacy `scriptScenes[].screenplayElements` into a canonical `scriptDocument` JSON payload.
  - Converts canonical `scriptDocument` back into legacy-compatible `scriptScenes` + compatibility artifacts.
  - Provides migration-safe normalization for projects that do not yet store `scriptDocument`.

- `src/store.js`
  - Persists `scriptEngine`, `scriptDocVersion`, `scriptDerivationVersion`, `scriptDocument`, and `scriptAnnotations` in project payloads.
  - Uses bridge normalization during save/load so old projects can be upgraded safely without changing Script tab UI.

- `src/features/scriptDocument/legacyBridge.test.mjs`
  - Parity tests for round-tripping, heading-driven scene splitting, migration from legacy-only payloads, and compatibility output shape.

## Compatibility behavior

During migration, `scriptDocument` is canonical for persistence, but legacy-compatible `scriptScenes` are still emitted to avoid breaking existing consumers (Scenes/Storyboard/Shotlist/Schedule/Callsheet/Cast-Crew paths).

## Not in scope for this phase

- No Script tab UI swap to ProseMirror yet.
- No deletion of the legacy Script tab path yet.
- No mobile changes.
