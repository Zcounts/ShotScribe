# Script Tab Migration Final Cleanup (Phase 8)

This phase retires the old Script tab architecture from production defaults and hardens release behavior.

## Production path

- `src/components/ScriptTab.jsx` now routes Script tab through the existing shell component with `useUnifiedEditorCore=true` by default.
- Legacy Script tab implementation remains in `src/components/ScriptTabLegacy.jsx` and is only activated as full legacy mode by fallback flag.
- Rollback kill switch is `VITE_ENABLE_LEGACY_SCRIPT_TAB=true`.

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
