# ShotScribe Launch Readiness Report (Audit)

Date: 2026-04-02
Scope: repository audit for launch hardening and operational readiness.

## Current architecture

- Main web app: React + Vite in `src/`, with manual in-app route switching for `/`, `/account`, `/admin`, `/accept-invite` based on `window.location.pathname` and `popstate` listener (no React Router).  
- Cloud/auth mode: `VITE_ENABLE_CLOUD_FEATURES` + Clerk + Convex providers; local-only fallback when env/config missing.  
- Backend: Convex with auth config, project/sharing/presence/assets/billing/admin modules and Stripe webhook HTTP route.
- Billing: Stripe Checkout + Billing Portal actions, webhook signature validation, subscription sync into Convex billing tables.
- Mobile companion: separate React + Vite app in `/mobile`, built with dependency on `/shared` contracts.
- Shared package: `/shared` TypeScript contracts/utilities used by web + mobile.
- Legacy Electron remains packaged but described as fallback/archive.

## Confirmed working paths (repo evidence + build checks)

- Root production build succeeds (`npm run build`) and generates `dist/`.
- Shared package build succeeds (`cd shared && npm run build`).
- Mobile build succeeds (`cd mobile && npm run build`).
- Account route exists and is wired to entitlement + checkout + portal actions.
- Admin route exists and is wired to admin state checks, dashboard overview, and safe ops controls.
- Invite acceptance route exists and opens cloud project after accept mutation.
- Convex HTTP route for Stripe webhook exists at `/stripe/webhook`.

## High-risk areas

1. **Routing fragility (manual pathname routing, no dedicated router)**  
   Why: route behavior depends on exact pathname checks and manual history events; easy to regress with future route additions.  
   Risk of change: High.

2. **Deployment path ambiguity across docs (canonical SiteGround manual artifact vs legacy Cloudflare guidance)**  
   Why: mixed instructions increase release-day misdeployment risk.
   Risk of change: Medium-High.

3. **Auth/admin/billing are operationally sensitive and tightly coupled to env correctness**  
   Why: entitlement, admin access, and billing UI depend on both frontend env and Convex/Stripe env being set correctly.
   Risk of change: High.

## Medium-risk areas

1. **Documentation drift in legacy migration docs**  
   Why: legacy docs still mention outdated env vars/hosting assumptions that do not match current runtime config.

2. **Bundle size/chunk warnings in root build**  
   Why: not a launch blocker, but indicates performance hardening debt.

3. **Operational validation is checklist-based, not automated**  
   Why: release confidence depends on manual smoke execution discipline.

## Low-risk cleanup

- Align or archive stale migration-era docs that reference deprecated Cloudflare/env assumptions.
- Add one canonical “production deploy path” doc linking exact commands + artifact folder + upload target.
- Add a small “smoke test run sheet” for launch day with owner/check timestamp fields.

## Missing operational/documentation pieces

- Single source of truth explicitly declaring **current production host + artifact upload destination + Convex deploy command sequence**.
- Explicit launch-day rollback command + owner mapping in one canonical doc (currently split across multiple docs).
- A short documented matrix for env var ownership (frontend host vs Convex deployment vs Stripe dashboard).

## Recommended launch order

1. Freeze code changes for auth/admin/billing/routing unless blocker-level.
2. Resolve documentation/deploy ambiguity (single canonical release runbook).
3. Execute full smoke suite (signed-out, signed-in, account/admin, local-only, cloud-enabled, Stripe, invites, mobile companion basics).
4. Deploy Convex first, then web artifact, then run production smoke immediately.
5. Keep rollback path ready (`cloud_writes_enabled` toggle + previous artifact restore).

## Prioritized action plan

### P0 — Launch blockers

1. **Canonicalize deployment/runbook path and remove ambiguity**
   - Why it matters: prevents shipping wrong artifact/host flow.
   - Files likely involved: `README.md`, `docs/public-beta-launch-checklist.md`, `docs/public-beta-env-setup.md`, `docs/migration/public-beta-go-live-checklist.md`, `docs/migration/public-beta-migration-plan.md`.
   - Risk of change: Low (docs only).
   - Fix now or defer: **Fix now**.

2. **Run and record full launch smoke matrix before release**
   - Why it matters: validates sensitive auth/admin/billing and collaboration flows in real environment.
   - Files likely involved: `docs/public-beta-launch-checklist.md`, `docs/collaboration-smoke-tests.md`, `docs/account-billing-page.md`.
   - Risk of change: Low (process only).
   - Fix now or defer: **Fix now**.

### P1 — Should fix before launch

1. **Document exact production deploy command sequence with ownership**
   - Why it matters: reduces operator error and dependency confusion.
   - Files likely involved: `README.md`, `docs/public-beta-launch-checklist.md`.
   - Risk of change: Low.
   - Fix now or defer: **Fix now**.

2. **Add explicit env var parity checklist (frontend vs Convex vs Stripe)**
   - Why it matters: most likely source of account/admin/billing incidents.
   - Files likely involved: `docs/public-beta-env-setup.md`, `docs/billing-stripe-runbook.md`, `README.md`.
   - Risk of change: Low.
   - Fix now or defer: **Fix now**.

### P2 — Can fix after launch

1. **Address large chunk warnings/code splitting plan**
   - Why it matters: improves performance and long-term reliability.
   - Files likely involved: `vite.config.js`, large feature bundles under `src/`.
   - Risk of change: Medium.
   - Fix now or defer: **Defer unless perf incident appears**.

2. **Consolidate legacy migration docs into an archived section**
   - Why it matters: prevents future confusion; low runtime risk.
   - Files likely involved: `docs/migration/*`.
   - Risk of change: Low.
   - Fix now or defer: **Defer to immediate post-launch**.

## Mismatch audit

- README + canonical launch docs align on SiteGround-style manual artifact deployment.
- `package.json` supports both generic (`build`) and SiteGround (`build:web`) builds.
- Legacy migration docs still reference Cloudflare staging/prod and outdated `VITE_AUTH_*` vars, while current runtime reads `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_CONVEX_URL`.
- Routing assumptions are domain-root SPA with `_redirects` and in-app pathname switching; this is consistent across canonical docs and app code.

## Current production build/deploy path (best-evidence)

**Most likely current path:**
1. Build web artifact with `npm run build:web` (outputs `dist-siteground/`) for manual hosting upload.
2. Deploy Convex functions/schema separately to production deployment.
3. Ensure frontend + Convex + Stripe env vars are set as documented.
4. Verify root SPA routes (`/`, `/account`, `/admin`, `/accept-invite?...`) post-deploy.

**Ambiguity noted:** legacy migration docs still describe Cloudflare Pages as if active, but canonical docs and scripts indicate SiteGround/manual artifact is current.

## Required smoke tests (exact scope)

1. **Signed-out flow**
   - Open `/` and `/account`; verify sign-in prompts and no app crash.
2. **Sign-in flow**
   - Sign in via Clerk; return to app shell; verify session bar state.
3. **Account page**
   - Validate entitlement summary, plan/billing fields, upgrade button (free), portal button (subscribed), sign-out.
4. **Admin page**
   - Non-admin gets forbidden; admin sees metrics + safe controls; test `cloud_writes_enabled` toggle in controlled env.
5. **Local-only mode**
   - Set `VITE_ENABLE_CLOUD_FEATURES=false` (or omit cloud keys) and verify app, `/account`, `/admin` safe fallback messaging.
6. **Cloud-enabled mode**
   - Set required cloud env vars and verify authenticated cloud features load.
7. **Stripe checkout**
   - Free user launches checkout, completes test payment, returns with updated entitlement.
8. **Billing portal**
   - Subscribed user opens portal, returns, app remains consistent.
9. **Invite/collab flow**
   - Owner invite -> collaborator accepts `/accept-invite?token=...` -> shared project opens; verify paid collaborator access rules.
10. **Mobile companion behavior (launch-relevant)**
   - Build mobile app, open core screens, verify shared-contract dependent import/build path remains healthy.

## Launch blockers only (short list)

- Deployment/runbook ambiguity between canonical and legacy docs.
- Full production smoke matrix evidence not yet recorded in-repo for this release.

## Suggested follow-up Codex prompt sequence

1. “Unify deployment docs: make one canonical production deploy runbook and mark legacy docs clearly archived.”
2. “Create a launch-day smoke test checklist with pass/fail logging template and owners.”
3. “Validate env var documentation against runtime usage and patch all mismatches.”
4. “Run a focused auth/admin/billing regression audit and produce a no-change verification report.”
5. “Create post-launch P2 plan for bundle splitting/perf hardening.”

## README/doc updates recommended before launch

- Add explicit “Current production hosting = SiteGround manual artifact upload” block with exact command sequence.
- Add explicit “Legacy migration docs are historical only” banner in migration docs that still mention Cloudflare as active path.
- Add a one-page “Release operator quickstart” linking env setup, launch checklist, rollback checklist, and support checklist.
