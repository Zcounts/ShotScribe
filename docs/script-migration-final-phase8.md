# Script Tab Migration Final Cleanup (Phase 8)

This phase retires the old Script tab architecture from production defaults and hardens release behavior.

## Production path

- `src/components/ScriptTab.jsx` now routes Script tab through the existing shell component with `useUnifiedEditorCore=true` by default.
- Legacy Script tab implementation remains in `src/components/ScriptTabLegacy.jsx` and is only activated as full legacy mode by fallback flag.
- Rollback kill switch is `VITE_ENABLE_LEGACY_SCRIPT_TAB=true`.

## Migration roadmap (active)

### Current baseline (from latest handoff)

- Restored Script tab shell/layout is active around the unified editor core default.
- Legacy editor remains rollback-only via `VITE_ENABLE_LEGACY_SCRIPT_TAB=true`.
- Typing direction/input regressions were reduced with imperative text syncing and caret-safe split/merge handling.
- Screenplay-aware writing behavior in the unified path is still incomplete and needs parity restoration.

### Roadmap item: Restore screenplay block types, styling, and Tab-cycle writing behavior in the unified Script tab

**In scope now**

- Reintroduce screenplay-aware write modes in unified default path:
  - scene heading / slug line
  - action
  - character
  - dialogue
  - parenthetical
- Restore Tab-forward cycling and Shift+Tab reverse cycling across screenplay block modes.
- Restore screenplay-aware Enter behavior for character/dialogue flows.
- Restore current-line block type reflection and block-style rendering parity with prior Script tab behavior.

**Explicitly out of scope now**

- Switching default editor path back to legacy implementation.
- Broad Script tab redesign, non-script tab changes, or full ProseMirror architecture rewrite.
- New collaboration features, new export UX work, or unrelated UI refreshes.

**Risks to watch**

- ContentEditable edge cases (IME/composition/caret drift) while parity behavior is layered on.
- Possible mismatch between unified node types and legacy style controls if type mapping drifts.
- Lock/read-only states must remain respected while adding keyboard write shortcuts.

**Follow-up work (next phases)**

- Finish forward-delete merge + additional screenplay-smart transitions.
- Complete visualize/breakdown overlay parity on unified editor coordinates.
- Replace custom contentEditable editing path with a full editor engine once parity baseline is stable.

### Roadmap item: Restore Breakdown and Visualize right-click interaction/dialog flows in the unified Script tab

**Current problem summary**

- Unified default Script tab path restored write/edit parity, but Breakdown and Visualize right-click flows are not parity-complete.
- Context-driven actions (selection tagging, contextual delete/link dialogs, mode-specific right-click behavior) are inconsistent vs legacy behavior.

**Scope for this phase**

- Restore Breakdown/Visualize interaction flow parity (especially right-click/context-menu driven actions) while keeping unified write path active.
- Reuse existing legacy Breakdown/Visualize menu/dialog behavior and handlers where safe, adapted into unified-default runtime path.
- Keep Script tab shell/layout/sidebar/configure wiring intact.

**Risks**

- Selection/range offsets can diverge between unified document nodes and legacy compatibility overlays.
- Right-click handling may conflict with browser defaults if mode guards are incomplete.
- Cloud lock/read-only constraints must remain enforced while restoring mode interactions.

**Must not regress**

- Write-mode typing stability, Tab/Shift+Tab type cycling, sidebar block-type controls, and bold toggles.
- Save/load/cloud snapshot behavior and rollback flag semantics.
- Restored Script tab shell/layout/sidebar behavior.

**Follow-up if parity is partial in this pass**

- Unify selection/range anchoring between unified nodes and annotation overlays.
- Migrate remaining context/dialog behavior to shared interaction layer that supports both write and read modes without legacy assumptions.

### Roadmap item: Restore Breakdown/Visualize highlight overlays and section-targeted right-click behavior in the unified Script tab

**Current problem summary**

- Breakdown/Visualize linking and tagging now work again, but visual highlight parity is incomplete after actions complete.
- Tagged/linked overlays are not consistently visible/anchored to expected text ranges while navigating paginated content.
- Right-click targeting is not section-scoped parity yet (should behave like triple-click full block targeting with mode-aware dialog flow).

**Scope for this phase**

- Restore visible category/shot-color overlay rendering parity for Breakdown and Visualize modes.
- Ensure highlight overlays stay attached to block text during paginated scrolling/navigation.
- Restore section-targeted right-click behavior (full block targeting) and mode-aware dialog/menu flow.

**Risks**

- Overlay fragment computation can become stale if DOM geometry changes without recomputation hooks.
- Selection normalization for right-click/triple-click may conflict with existing word-level selection behavior.
- Existing working link/tag actions must remain intact while changing context targeting semantics.

**Non-regression requirements**

- Do not regress write-mode typing, Tab cycling, sidebar block-type controls, bold toggles, or current link/tag success flows.
- Do not regress save/load/cloud/lock behavior or rollback flag behavior.
- Keep shell/layout/sidebar/configure wiring unchanged.

**Follow-up work if parity remains partial**

- Move overlay anchoring to shared range-position utilities reused by both read/write surfaces.
- Add stronger integration tests for breakdown and visualize overlay/selection behaviors across imports and reloads.

## Removed from active path

- Legacy ScriptTab contenteditable/blur-commit editing code.
- Legacy Script-tab-only shot-link offset indexing inside the active ScriptTab entrypoint.
- Legacy phase-1 pagination rollout flag path (`VITE_ENABLE_SCRIPT_DOC_PAGINATION`).

## Compatibility readers retained

- Legacy shot-link ranges are still read and migrated into structured annotations.
- Legacy breakdown tags are still read and migrated into structured annotations.
- Legacy adapter outputs continue feeding downstream tabs (`scriptScenes`, `breakdownTags`, `shotLinkIndexBySceneId` compatibility shape).

## Release regression checklist

1. Open historical local project and verify Script tab content appears.
2. Open historical cloud project and verify Script tab content appears.
3. Type/edit/delete/newline in Script tab without disappearing text.
4. Verify heading edits update scene derivation in dependent tabs.
5. Verify visualize links still highlight and open linked shots.
6. Verify breakdown compatibility overlays still render from compatibility data.
7. Verify Storyboard, Shotlist, Schedule, Callsheet, and Cast/Crew tabs continue to load script-derived data.
8. Verify local save/load round-trip preserves script/annotation state.
9. Verify cloud snapshot save/load with lock/snapshot workflows.
10. Verify dirty-session protection behavior when remote state updates arrive.

## Known risk

- Emergency fallback remains available but should only be used as a short-term rollback if a blocking issue is found in production.

## Visual/layout parity requirement (release note)

- The restored Script tab should match the previous Script tab’s styling, layout, spacing, and general UI structure as closely as possible.
- Reuse the exact existing sidebar/shell/layout code where possible instead of re-creating lookalike versions from scratch.
- Preserve the same visual styling, spacing, panel structure, and overall arrangement the Script tab had before this regression.
- Keep the right sidebar and the top-right Configure button linked exactly the way they were before.
- Keep the left sidebar structure/functionality aligned with the previous Script tab where it still makes sense with the new editor foundation.
- Prefer reusing the old shell/panel components and wiring them around the new unified script-document editor rather than rebuilding duplicate layout code.
- Only replace or adapt pieces that are genuinely editor-internal or incompatible with the new architecture.
- Do not introduce a noticeably new visual design in this pass; this is a restoration pass around the new editor core.
