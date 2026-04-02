# ShotScribe Repo Cleanup Audit

## 1. Executive Summary
This pass focused on conservative cleanup only. The repository appears actively maintained, with most code and docs tied to current beta hardening, billing/auth ops, Convex deployment, and mobile-cloud continuity work. Only two clearly safe junk files were removed. Everything else that looked potentially stale or confusing was documented for manual review instead of being deleted.

## 2. Safe Deletions Performed
1. `landing/tmp.txt`
   - Why deleted: 1-byte placeholder file with no references in source, scripts, workflows, or docs.
   - Safety: High confidence.
2. `assets/script icons/tmp.txt`
   - Why deleted: 1-byte placeholder file with no references in source, scripts, workflows, or docs.
   - Safety: High confidence.

## 3. Questionable / Manual Review Items
1. `reference_image`
   - Why questionable: Large top-level PNG-like binary (~793 KB) with no filename extension and no references found.
   - Possible dependency risk: Could still be used manually as a visual reference by product/design workflows.
   - Recommended next step: Rename to explicit filename + move to `docs/assets/` (or remove) after human confirmation.

2. `shotscribe-home.html`
   - Why questionable: Large standalone static page that looks like an older mock/prototype shell.
   - Possible dependency risk: Could still be used in external/manual SiteGround upload or migration testing.
   - Recommended next step: Confirm current production routing usage; archive or remove if no longer used.

3. `site/index.html` + `src/authLandingMain.jsx`
   - Why questionable: Alternate entrypoint path that differs from the main app root entry.
   - Possible dependency risk: Could be part of static hosting route split (`/` vs `/app`) and auth landing flow.
   - Recommended next step: Validate deployment routing map before consolidating.

4. `electron/` and Electron scripts in root `package.json`
   - Why questionable: Desktop shell appears legacy/fallback versus current web-first launch path.
   - Possible dependency risk: Could still be used for desktop packaging/recovery releases.
   - Recommended next step: Confirm release policy; if desktop is deprecated, move to explicit archived status.

5. Docs overlap in `docs/public-beta-*.md`, `docs/migration/*.md`, and launch/readiness checklists
   - Why questionable: Multiple partially overlapping runbooks/checklists can increase operator confusion.
   - Possible dependency risk: Teams may rely on different checklist documents for incidents/launch tasks.
   - Recommended next step: Designate one canonical launch runbook and archive older checklist variants.

## 4. Unused or Likely Dead Code Inside Existing Files
1. `src/components/ClapperIcon.jsx` (`ClapperIcon`)
   - Why it looks unused: No imports/references found in app code.
   - Confidence: High.

2. `src/components/ui/date-picker.jsx` (`DatePicker` export)
   - Why it looks unused: Export exists, but no imports/references found.
   - Confidence: High.

3. `src/shortcuts.js` (`findShortcutConflict`, `resetShortcutBindings`, `SHORTCUT_STORAGE_KEY` exports)
   - Why it looks unused: Exported helpers have no cross-file references.
   - Confidence: Medium (may be future-facing API surface).

4. `src/lib/toast.js` (`dismissToast` export)
   - Why it looks unused: No references found to this named export.
   - Confidence: Medium.

5. `src/store.js` exported constants (`CARD_COLORS`, `DEFAULT_*_COLUMN_CONFIG`, `VALID_SHOT_LETTERS`)
   - Why it looks unused: Named exports do not appear referenced outside store file.
   - Confidence: Medium (can be intentional for tooling/manual import usage).

## 5. Documentation Audit
- Updated:
  - `README.md` (deployment/build clarity and workflow accuracy updates).
  - `docs/repo-cleanup-audit.md` (new audit report).
- Deleted:
  - None of the existing docs were removed in this pass.
- Docs that should probably be merged/archived later:
  - Overlapping launch/migration checklists in `docs/public-beta-*.md` and `docs/migration/*.md`.
- Outdated docs likely needing refresh/review:
  - Migration-planning docs that discuss historical transitional states and may no longer match current production ops reality.

## 6. README Changes
README was updated to better match current real workflows:
- clarified web-first monorepo composition and mobile mode reality
- clarified deployment pipeline details for SiteGround artifact packaging, Convex auto deploy, and mobile artifact workflow
- clarified local build commands and output differences (`build` vs `build:web`/`build:siteground`)

## 7. Recommended Follow-Up Cleanup Pass
Priority order:
1. Confirm whether `reference_image` is still needed; either move/rename as a documented asset or remove.
2. Verify whether `shotscribe-home.html` is still part of any real production/static route flow.
3. Validate necessity of `site/index.html` + `src/authLandingMain.jsx` and document canonical route-entry strategy.
4. Consolidate public beta launch docs into one canonical runbook plus archived historical docs directory.
5. Remove or wire truly unused exports/components after targeted grep + runtime checks.

## 8. Risks / Things Intentionally Left Alone
- Any file potentially involved in dynamic imports, static-host routing, Convex deploy, SiteGround manual release, or emergency operational runbooks was intentionally left untouched.
- Legacy-looking Electron paths were left intact due potential fallback packaging dependence.
- Overlapping docs were not aggressively removed to avoid deleting operationally relevant runbook details.

## 9. Files Touched
- `README.md`
- `docs/repo-cleanup-audit.md`
- `landing/tmp.txt` (deleted)
- `assets/script icons/tmp.txt` (deleted)
