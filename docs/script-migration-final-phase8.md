# Script Tab Migration Final Cleanup (Phase 8)

This phase retires the old Script tab architecture from production defaults and hardens release behavior.

## Production path

- `src/components/ScriptTab.jsx` now routes Script tab to the unified script-document surface by default.
- Legacy Script tab implementation was isolated to `src/components/ScriptTabLegacy.jsx` as an emergency fallback only.
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
