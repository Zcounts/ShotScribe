# Repo Cleanup Follow-up (Execution Pass)

_Date: 2026-04-02_

## Executive summary

This pass executed the cleanup task list from the prior audit with evidence-based delete/archive decisions.

High-level outcomes:
- Removed dead alternate landing entrypoints and their unused React mount/components.
- Removed active Electron packaging scripts/config/dependencies and archived related historical context in docs.
- Archived legacy static artifacts and migration-phase docs out of active paths.
- Added one canonical support checklist doc to fix existing runbook link gaps.
- Kept runtime behavior focused on the current browser/SiteGround flow.

## Usage tracing performed before changes

Commands and checks used:

- `rg -n "shotscribe-home|site/index|authLandingMain|reference_image|electron|build:desktop|electron:|dist-electron" ...`
- `rg --files .github/workflows` and review of each workflow for build/deploy usage.
- `sed -n` review of:
  - `vite.config.js`
  - `index.html`
  - `site/index.html`
  - `src/authLandingMain.jsx`
  - `src/auth/AuthLanding.jsx`
  - `package.json`
- `rg -n "AuthLanding" src`
- `rg -n "docs/migration/" README.md docs src .github`
- `python` binary signature check for `reference_image` (confirmed PNG blob in repo root).

## What was deleted

### Removed dead code/paths

1. `site/index.html`
   - Not part of Vite build input (`vite.config.js` only builds `index.html`).
   - Not referenced by CI workflows or deploy packaging.
   - No active route/entrypoint integration.

2. `src/authLandingMain.jsx`
   - Only referenced by deleted `site/index.html`.

3. `src/auth/AuthLanding.jsx`
   - Only referenced by deleted `src/authLandingMain.jsx`.

4. Electron runtime files:
   - `electron/main.cjs`
   - `electron/preload.cjs`

### Removed active script/config surface for unused desktop packaging

`package.json` cleanup:
- Removed `main: "electron/main.cjs"`.
- Removed scripts:
  - `electron:dev`
  - `build:desktop`
  - `electron:build`
  - `electron:build:win`
  - `electron:build:mac`
- Removed Electron-only build config block (`build` for electron-builder).
- Removed desktop-packaging dev dependencies:
  - `electron`
  - `electron-builder`
  - `concurrently`
  - `cross-env`
  - `wait-on`

## What was archived/moved

1. Root mystery asset:
- `reference_image` -> `docs/archive/assets/reference-image.png`

2. Legacy static landing HTML:
- `shotscribe-home.html` -> `docs/archive/legacy-static/shotscribe-home.html`

3. Migration docs moved out of active docs root:
- `docs/migration/*.md` -> `docs/archive/migration/*.md`

4. Added archive index:
- `docs/archive/README.md`

## Docs consolidation changes

1. Added canonical support runbook:
- `docs/public-beta-support-checklist.md`

2. Updated docs mentioning removed active Electron packaging:
- `docs/developer-notes-web-first.md`
- `docs/save-sync-architecture.md`
- `docs/platform-service-layer.md`

3. Updated `README.md` to remove stale claim that active repo includes Electron shell packaging.

## What was intentionally kept

1. `src/services/platformService.js`
   - Kept optional `window.electronAPI` detection/fallback guard logic to avoid runtime breakage if a desktop bridge is injected externally.
   - Browser-first flows remain unchanged.

2. Archived migration docs (not deleted)
   - Retained for historical traceability while removing them from active operational doc paths.

## Evidence summary for key decisions

- `site/index.html` + `src/authLandingMain.jsx` + `src/auth/AuthLanding.jsx` formed an isolated chain with no active build/deploy references.
- Electron packaging had references only in root `package.json` and historical docs; no CI workflow invoked Electron builds.
- Root `reference_image` had no code/workflow references and was an unnamed binary PNG; archived with explicit name/location.
- `shotscribe-home.html` was not part of active build/deploy inputs and was referenced as historical in migration docs; archived.

## Validation

Executed after cleanup:

1. `npm install`
2. `npm run build`
3. `npm run build:web`

Results:
- All three commands passed.
- Vite emitted non-fatal chunk-size warnings.

## Remaining unresolved items (genuine)

- None blocking for this pass.
- If desktop packaging is required again, it should return as an explicit feature with dedicated scripts/workflow/docs rather than passive legacy residue.
