# Repo Cleanup Follow-up (Conservative Pass)

_Date: 2026-04-02_

## Executive summary

This pass was intentionally conservative and stability-first. I performed a repository-wide audit focused on clearly safe housekeeping only, with strict protection on previously flagged questionable items (`reference_image`, `shotscribe-home.html`, `site/index.html`, `src/authLandingMain.jsx`, `electron/`, electron scripts, and overlapping beta/migration/runbook docs).

Result:
- No speculative deletions were made.
- No architecture/routing/auth/billing/mobile/deployment files were modified.
- The two previously identified placeholder `tmp.txt` files are already absent.
- Validation builds for both standard and SiteGround targets pass after dependency install.

## Audit scope and method

Commands used for tracing and verification:

- `rg --files -g 'AGENTS.md'`
- `rg --files | head -n 200`
- `rg --files | rg 'tmp|\.tmp|~$|\.bak$|\.old$|reference_image|shotscribe-home\.html|site/index\.html|authLandingMain\.jsx|electron/'`
- `test -e 'landing/tmp.txt' && echo ...`
- `test -e 'assets/script icons/tmp.txt' && echo ...`
- `rg -n "authLandingMain|shotscribe-home|site/index|reference_image|electron|preload\.cjs|main\.cjs" ...`
- `sed -n` checks on `src/authLandingMain.jsx`, `site/index.html`, and `shotscribe-home.html`

## What was safely removed

No files were removed in this pass.

Reason: all reviewed items were either already gone, clearly used, or not provably safe to remove under the zero-risk criteria.

## What was intentionally left alone

### Protected items (explicitly retained)

1. `reference_image`
   - Binary PNG-like artifact with no clear guaranteed-unused proof.
   - No deletion made due possible manual design/reference use.

2. `shotscribe-home.html`
   - Explicitly referenced in migration planning docs as part of static landing considerations.
   - Retained as potentially relevant to fallback/static hosting workflows.

3. `site/index.html`
   - Directly loads `/src/authLandingMain.jsx` and appears to be a static/auth landing entrypoint.
   - Retained.

4. `src/authLandingMain.jsx`
   - Entry module used by `site/index.html`.
   - Retained.

5. `electron/` and Electron scripts
   - Root `package.json` uses `electron/main.cjs` as `main` and includes multiple electron build/dev scripts.
   - Electron files are included in desktop build config.
   - README and developer notes describe Electron as legacy fallback packaging.
   - Retained.

6. Overlapping docs (`docs/public-beta-*`, `docs/migration/*`, launch/readiness docs)
   - Retained because overlap alone is insufficient proof of obsolescence.
   - These likely serve runbook/history/incident readiness purposes.

## Questionable/manual-review items

No protected item met the “strong evidence safe-to-delete” bar in this pass.

Manual-review candidates for a future explicit pass (no changes made now):
- `reference_image`: determine ownership and intended operational/design usage.
- Overlapping beta/migration/runbook docs: map canonical runbooks vs archival references and add explicit status tags.
- `shotscribe-home.html` vs `site/index.html`: verify current production routing/deployment usage and fallback expectations.

## Unused code/assets/docs found but not removed

- No additional files were confidently proven unused across imports + scripts + workflow/build/deployment references.
- The previously identified placeholders:
  - `landing/tmp.txt`
  - `assets/script icons/tmp.txt`
  are already missing, so no action required.

## README/doc touch-ups

One minimal README edit was made:
- Added a pointer in the stabilization guardrails section to this follow-up cleanup report (`docs/repo-cleanup-followup.md`).

Rationale:
- This creates a single discoverable handoff note for conservative cleanup outcomes without changing product or operational behavior.
- No broader README rewrite was performed.

## Validation

Executed:

1. `npm install`
   - Completed successfully.

2. `npm run build`
   - Initial attempt failed before install due unresolved dependency (`sonner`) in local environment state.
   - Re-ran after install; build passed.

3. `npm run build:web`
   - Passed.

Notes:
- Vite emitted chunk-size warnings only (non-failing informational output).
- npm printed an environment warning about unknown `http-proxy` config.

## Risks and rationale for each non-removal

- **Routing/entrypoint risk**: `site/index.html` + `src/authLandingMain.jsx` may be active static auth landing path; removal could break auth entry flow.
- **Deployment/fallback risk**: `shotscribe-home.html` may be used in manual/static hosting workflows and migration runbooks.
- **Desktop packaging risk**: removing `electron/` or electron scripts conflicts with current package config and fallback packaging path.
- **Operational history risk**: migration/checklist/runbook docs may be required for incident response and rollout rollback support.
- **Reference artifact risk**: `reference_image` may be intentionally kept as design or ops reference despite no code import.

## Recommended next cleanup pass (separate task)

1. **Doc canonization pass (non-destructive)**
   - Build a doc index with status labels: `canonical`, `supporting`, `archived`.
   - Add cross-links and “use this first” headers.
   - Avoid deletion until owners approve.

2. **Static entrypoint provenance check**
   - Confirm exactly which static files are deployed to SiteGround and which are legacy/fallback.
   - Record authoritative deploy map in one runbook.

3. **Reference asset inventory**
   - Track unimported top-level artifacts (e.g., `reference_image`) with owner + purpose metadata.

4. **Optional lint-style dead-code sweep**
   - Run a dedicated unused import/symbol analysis pass with explicit allowlist for dynamic and runtime-injected paths.
