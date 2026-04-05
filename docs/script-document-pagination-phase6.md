# Script Document Pagination (Phase 6)

This phase adds a stable phase-1 paginated presentation layer for the ProseMirror-style Script document path.

## What was added

- `src/features/scriptDocument/scriptPagination.js`
  - deterministic pagination function for script document blocks
  - approximate line-wrap based layout metrics for document feel
  - supports natural mode and scene-new-page mode

- `src/features/scriptDocument/ScriptDocumentPaginationSurface.jsx`
  - page-like rendering surface for script document blocks
  - continuous editing within paginated frames
  - commits via existing debounced script document update/derivation actions

- `src/config/runtimeConfig.js`
  - original `VITE_ENABLE_SCRIPT_DOC_PAGINATION` rollout flag (retired in final migration cleanup)

- `src/components/ScriptTab.jsx`
  - phase-1 PM pagination surface integration point (now superseded by final migration default routing)

## Intentional limits

- Not print-perfect screenplay pagination yet.
- No export pagination changes.
- No comment/collab model changes.
