# Script Document Derivation Pipeline (Phase 3)

This phase adds a debounced derivation pipeline for Script tab migration.

## What this phase adds

- `src/features/scriptDocument/derivationPipeline.js`
  - `deriveScriptAdapterOutputs(...)` to derive compatibility outputs from `scriptDocument`.
  - Breakdown aggregate derivation (`total`, by-scene, by-category).
  - Shot-link index derivation grouped by script scene.
  - `createScriptDerivationDebouncer(...)` utility for burst-typing safety.

- `src/store.js` dataflow additions
  - New script derivation state:
    - `scriptDocumentLive`
    - `scriptDerivedCache`
    - `scriptDerivationState`
    - `_scriptDerivationTimeout`
  - New actions:
    - `updateScriptDocumentLive(...)`
    - `deriveScriptDocumentNow(...)`
    - `flushScriptDocumentDerivation(...)`

## Dataflow separation

- Live editor transactions now target `scriptDocumentLive` first (future PM editor path).
- Debounced derivation updates adapter outputs (`scriptScenes`, metadata, breakdown aggregates, shot-link indexes).
- Persistence remains compatible with existing save/load/sync paths.
- Save safety guard: when the UI is still legacy-driven, persistence can prefer
  current `scriptScenes` as authoritative input and regenerate canonical
  `scriptDocument` at save boundaries to avoid stale-canonical data loss.

## Scope guardrails

- Script tab UI was not swapped in this phase.
- No broad tab rewrites.
- Existing consumers still receive legacy-compatible outputs.
