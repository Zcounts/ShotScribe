# ShotScribe Public Beta Migration Plan (Convex + Cloudflare Pages + Stripe)

Date: 2026-04-01

This document audits current repo reality and provides an incremental migration plan from the current local-first/SiteGround-oriented state to a Public Beta SaaS architecture.

---

## A) Repo audit summary

### 1) Current deployment assumptions

- Root web build currently uses Vite with `base: './'`, which assumes relative static deployment rather than explicit `/` + `/app` route separation.
- Build scripts are still explicitly SiteGround-oriented (`build:web` and `preview:web` run `--mode siteground` and output to `dist-siteground`).
- `docs/developer-notes-web-first.md` explicitly states static SiteGround hosting and no cloud backend.
- Root app entrypoint (`index.html`) directly mounts the app; there is no dedicated landing/app split in the active build.
- A separate static landing file exists (`shotscribe-home.html`) but is not integrated into a production routing pipeline.

### 2) Current persistence model

- Current platform abstraction (`src/services/platformService.js`) writes autosave, recent projects, and browser snapshots to `localStorage`.
- Save/open flows are file download + file picker in browser mode, and Electron bridge when available.
- `docs/platform-service-layer.md` and `docs/developer-notes-web-first.md` define local-only persistence and import/export as the current contract.
- No Convex schema/functions exist yet in repo.
- No Stripe backend/webhooks exist yet in repo.
- No auth provider integration is present.

### 3) Current routing/path assumptions

- App currently assumes a single mount path via `index.html` + `src/main.jsx`.
- No React Router currently defines route namespaces (`/`, `/app`, etc.).
- `vite.config.js` relative base works for static folders, but can create ambiguity for deploying app as a strict subpath (`/app`) with modern SPA fallback.

### 4) What will break (or be risky) when moving to landing at `/` and app at `/app`

- Direct root SPA assumptions in `index.html` will conflict with dedicated landing root unless app entry is moved/split.
- Without explicit Cloudflare Pages rewrite config, deep links under `/app/*` can 404.
- Relative base assumptions can produce brittle asset paths when deployed with separate build targets.
- Existing `shotscribe-home.html` links are placeholders (`href="#"`) and do not route to real app entry.

### 5) What will break (or be risky) when adding Convex/auth/cloud/Stripe/shared/live sync

- Current state management is monolithic local Zustand store; no cloud identity, ownership, or ACLs yet.
- No project identity model distinguishing local project IDs vs cloud project IDs.
- No tier gating layer to enforce “free=local-only, paid=cloud”.
- No secure backend API for project sharing or invite acceptance.
- No cloud asset storage abstraction; images are currently local/file/export-centric.
- No optimistic-concurrency or lock/version layer for screenplay-safe collaboration.
- No webhook handler pipeline to map Stripe subscription status into app entitlements.

---

## B) Recommended repo structure (incremental, low-risk)

```text
/
  src/                       # existing main app UI (becomes /app frontend)
  mobile/                    # existing companion app
  shared/                    # shared contracts/types/utilities
  convex/                    # NEW Convex backend
    schema.ts
    auth.config.ts
    users.ts
    projects.ts
    projectMembers.ts
    projectSnapshots.ts
    screenplayLocks.ts
    assets.ts
    presence.ts
    billing.ts
    webhooks.ts
    http.ts
  site/                      # NEW landing site source for /
    index.html
    src/main.tsx             # or vanilla entry
    src/components/*
  app/                       # NEW optional wrapper for /app-specific entry assets if split build is chosen
  docs/migration/
    public-beta-migration-plan.md
    phase-01-*.md            # optional phase logs/checklists
  functions/                 # OPTIONAL if Cloudflare Functions are used (only if needed)
  public/
    _redirects               # Cloudflare Pages rewrites for /app/*
```

### Source vs generated/deploy/config map

- **Source files**: `src/`, `site/`, `mobile/src/`, `shared/src/`, `convex/`.
- **Generated output**: `dist/`, `dist-siteground/`, `mobile/dist/`, `shared/dist/` (do not hand-edit).
- **Deployment config**: `vite.config.js`, `site/vite.config.ts` (if split), `public/_redirects`, Cloudflare Pages project settings.
- **Env files**: `.env.local`, `.env.production`, `convex/.env.local` (gitignored).
- **Convex schema/functions**: all files under `convex/`.
- **Landing page files**: `site/**` (recommended) or minimal root `index.html` + landing bundle.
- **App files**: existing `src/**` (served under `/app`).

---

## C) Owner setup checklist (Zac, plain English)

## Accounts to create

1. Convex account + one project for **staging** and one for **production**.
2. Cloudflare account + Pages access.
3. Stripe account with product/pricing setup.
4. Auth provider account (recommended Clerk/Auth0/Supabase Auth) configured for Convex JWT.

## Keys/secrets to save (in password manager)

- Convex deployment URL + deploy key.
- Convex admin key (if used).
- Auth issuer URL, JWKS URL, audience/client IDs.
- Stripe publishable key.
- Stripe secret key.
- Stripe webhook signing secret.
- Cloudflare Pages project env vars.

## What to click in Convex

1. Create project (`shotscribe-staging`, then `shotscribe-prod`).
2. In project settings, enable auth provider/JWT config.
3. Add environment variables for Stripe secret + webhook secret.
4. Deploy Convex functions from repo.
5. Open dashboard tables and verify `users`, `projects`, `projectMembers`, `billing` appear.
6. Run a test query/mutation from Convex dashboard to confirm connectivity.

## What to click in Cloudflare Pages

1. Create Pages project from GitHub repo.
2. Set build command/output for chosen frontend layout.
3. Add env vars for `VITE_CONVEX_URL`, `VITE_STRIPE_PUBLISHABLE_KEY`, auth client keys.
4. Add redirects for SPA behavior (`/app/*` -> `/app/index.html`).
5. Connect custom domain.
6. Validate `/` serves landing and `/app` serves app.

## What to click in Stripe

1. Create product “ShotScribe Pro” and monthly/annual prices.
2. Enable promotion codes/coupons.
3. Configure Customer Portal settings.
4. Add webhook endpoint (Convex HTTP action URL) for subscription events.
5. Select events: customer.subscription.*, checkout.session.completed, invoice.paid, invoice.payment_failed.
6. Copy webhook signing secret into Convex env vars.

## After each setup step

- Immediately run a smoke test (login, upgrade, entitlement refresh).
- Save screenshots + notes in `docs/migration/phase-notes.md`.
- Record exact IDs (price IDs, webhook endpoint IDs, Convex deployment URL).

---

## D) Phase list (best order, lowest risk first)

1. **Phase 0: Baseline hardening + routing prep**
2. **Phase 1: Landing/App path split on Cloudflare-safe routing**
3. **Phase 2: Convex scaffold + auth identity wiring**
4. **Phase 3: Dual persistence model (free local + paid cloud)**
5. **Phase 4: Cloud projects + sharing + access control**
6. **Phase 5: Safe beta collaboration model for screenplay**
7. **Phase 6: Cloud asset storage integration**
8. **Phase 7: Stripe billing + entitlement gating**
9. **Phase 8: Public beta release hardening + ops runbook**

---

## E) Copy-paste implementation prompts for each phase

## Phase 0 prompt — Baseline hardening + routing prep

**Goal**  
Stabilize current app behavior and add migration scaffolding without changing user-facing workflow.

**What to change**
- Add `docs/migration/` phase tracker docs.
- Add environment config loader for future Convex/Stripe/auth variables (no runtime dependency yet).
- Add explicit app mode flags in code (`localOnly`, `cloudEnabled`) defaulting to local-only.
- Add light telemetry/log points for save/open/import/export outcomes.

**Likely files involved**
- `src/services/platformService.js`
- `src/store.js`
- `src/App.jsx`
- `README.md`
- `docs/migration/*`

**Avoid breaking**
- Current import/export flows.
- Autosave and recent projects.
- Script tab pagination/document behavior.

**Acceptance criteria**
- Existing local-only workflows still function exactly as before.
- No new required env vars for local development.
- Migration flags exist and default to current behavior.

**Config/commands needed**
- `npm install`
- `npm run dev:web`
- `npm run build:web`

**How to test before moving on**
1. Create project locally, refresh browser, confirm persistence.
2. Export `.shotlist`, re-import, verify integrity.
3. Build passes with no new cloud setup.

---

## Phase 1 prompt — Landing at `/` and App at `/app`

**Goal**  
Deploy routing shape required for public beta while keeping app behavior stable.

**What to change**
- Introduce dedicated landing source (`/site`) and app source under `/app` path.
- Update Vite/Cloudflare config so landing is served at `/` and app at `/app`.
- Add Cloudflare `_redirects` / fallback rules for SPA deep links under `/app/*`.
- Replace placeholder landing links with real CTA to `/app`.

**Likely files involved**
- `vite.config.js` (or split configs)
- `index.html` / `site/index.html`
- `shotscribe-home.html` (or migrated replacement)
- `public/_redirects`
- `package.json`

**Avoid breaking**
- Existing app bundle behavior.
- Asset paths in production.
- Mobile and shared package builds.

**Acceptance criteria**
- `/` loads landing page.
- `/app` loads web app.
- `/app/...` deep links resolve via SPA fallback.
- Existing app features still work.

**Config/commands needed**
- `npm run build`
- `npm run preview`
- Cloudflare Pages preview deployment

**How to test before moving on**
1. Open `/` and verify landing CTA links to `/app`.
2. Open `/app`, hard refresh, confirm no 404.
3. Open a nested app URL and refresh, confirm SPA loads.

---

## Phase 2 prompt — Convex scaffold + auth identity wiring

**Goal**  
Introduce backend foundation and authenticated identity without migrating project data yet.

**What to change**
- Initialize `convex/` with schema + auth config.
- Add tables for users and basic account profile.
- Add auth provider integration in frontend.
- Add session-aware app shell (signed-out vs signed-in state).

**Likely files involved**
- `convex/schema.ts`
- `convex/auth.config.ts`
- `convex/users.ts`
- `src/main.jsx`
- `src/App.jsx`
- new `src/auth/*`

**Avoid breaking**
- Anonymous local-only mode.
- Existing store behavior for free users.

**Acceptance criteria**
- User can sign in/out.
- Signed-in identity is available to app.
- Local-only mode still fully usable without paid plan.

**Config/commands needed**
- `npx convex dev`
- `npm run dev:web`
- Set `VITE_CONVEX_URL`, auth env vars.

**How to test before moving on**
1. Login success and logout success.
2. Signed-out user can still use local project.
3. Signed-in user sees account identity in UI.

---

## Phase 3 prompt — Dual persistence: local free + cloud paid foundation

**Goal**  
Add storage abstraction that supports both local-only projects and cloud-backed projects.

**What to change**
- Introduce `ProjectRepository` interface with local + cloud adapters.
- Keep local format/import/export fully intact.
- Add cloud project entity in Convex with project metadata and snapshots.
- Add conversion path: local project -> cloud project (copy, not destructive).

**Likely files involved**
- new `src/data/repository/*`
- `src/store.js`
- `convex/projects.ts`
- `convex/projectSnapshots.ts`
- `shared/src/types/project.ts`

**Avoid breaking**
- `.shotlist` import/export compatibility.
- local autosave/recent behavior.

**Acceptance criteria**
- Free user works entirely local.
- Paid/entitled user can create cloud project.
- Same UI can open both project types.

**Config/commands needed**
- `npx convex dev`
- `npm run dev:web`
- seed/test script for cloud project creation

**How to test before moving on**
1. Create local project, export/import verify unchanged.
2. Convert local -> cloud project and reopen from cloud.
3. Switch between local and cloud projects in same session.

---

## Phase 4 prompt — Shared cloud projects + ACL safety

**Goal**  
Enable safe project sharing for paid cloud projects.

**What to change**
- Add `projectMembers` table with role model (`owner`, `editor`, `viewer`).
- Add invite flow (token/email-based).
- Enforce ACL checks in all Convex mutations/queries.
- Add UI for manage members and permissions.

**Likely files involved**
- `convex/projectMembers.ts`
- `convex/projects.ts`
- `src/components/SettingsPanel.jsx` (or new sharing modal)
- new `src/features/sharing/*`

**Avoid breaking**
- Single-user local-only flow.
- Performance in large projects.

**Acceptance criteria**
- Owner can invite collaborator.
- Collaborator can open shared project per role.
- Unauthorized user cannot access data.

**Config/commands needed**
- Convex env var for invite URL base
- `npm run dev:web`
- `npx convex dev`

**How to test before moving on**
1. Invite accepted by second test account.
2. Viewer cannot edit restricted fields.
3. Revoked user loses access immediately.

---

## Phase 5 prompt — Safe beta screenplay collaboration (guardrails)

**Goal**  
Ship practical collaboration safety (not full character-level CRDT).

**What to change**
- Add scene-level or document-section lock protocol (`screenplayLocks`).
- Add lightweight presence indicators (who is viewing/editing scene).
- Add version token on save to prevent silent overwrite.
- Add recovery/version history snapshots for screenplay changes.

**Likely files involved**
- `convex/screenplayLocks.ts`
- `convex/presence.ts`
- `convex/projectSnapshots.ts`
- `src/components/ScriptTab.jsx`
- `src/store.js`

**Avoid breaking**
- Script tab pagination/document-first behavior.
- Offline local editing in free mode.

**Acceptance criteria**
- Two users can safely collaborate with visible lock/presence status.
- Conflicting edit attempts are blocked or merged with clear UX.
- Previous version can be restored.

**Config/commands needed**
- `npx convex dev`
- two browser sessions for concurrency tests

**How to test before moving on**
1. User A locks scene, User B sees lock and cannot unsafe-overwrite.
2. Presence updates within a few seconds.
3. Restore prior screenplay snapshot works.

---

## Phase 6 prompt — Cloud asset storage

**Goal**  
Move paid cloud project images/assets into Convex storage with secure access.

**What to change**
- Add upload + asset metadata functions in Convex.
- Replace direct local image assumptions in cloud project mode.
- Keep local asset behavior for free local projects.
- Add cleanup rules for orphaned cloud assets.

**Likely files involved**
- `convex/assets.ts`
- `src/utils/storyboardImagePipeline.js`
- `src/store.js`
- new `src/services/assetService.ts`

**Avoid breaking**
- Existing local image workflows.
- Export quality/performance.

**Acceptance criteria**
- Cloud project uploads persist and re-open across devices.
- Access to asset URLs is permission-gated.
- Local projects still store assets locally/exportably.

**Config/commands needed**
- Convex storage enabled
- `npx convex dev`
- `npm run dev:web`

**How to test before moving on**
1. Upload image in cloud project, open same project on second account/member.
2. Remove shot/project and verify asset cleanup policy.
3. Verify export still includes expected images.

---

## Phase 7 prompt — Stripe billing + entitlement gating

**Goal**  
Enforce paid-only cloud features with Stripe-backed subscription state.

**What to change**
- Add checkout/session creation backend function.
- Add Stripe webhook handler to sync subscription status into Convex billing table.
- Add entitlement resolver (`canUseCloudFeatures`).
- Gate cloud create/save/share/sync paths by entitlement.

**Likely files involved**
- `convex/billing.ts`
- `convex/webhooks.ts`
- `convex/http.ts`
- new `src/features/billing/*`
- `src/App.jsx` / `src/store.js`

**Avoid breaking**
- Free local mode.
- Existing local import/export for non-paying users.

**Acceptance criteria**
- Non-paid users cannot create cloud projects.
- Paid users can create/share/sync cloud projects.
- Subscription cancellation or payment failure updates access correctly.

**Config/commands needed**
- Stripe keys + webhook secret in Convex env
- Stripe CLI optional for local webhook replay
- `npx convex dev`

**How to test before moving on**
1. Test checkout success -> entitlement granted.
2. Test cancel/failure webhook -> entitlement removed/restricted.
3. Verify local-only functionality remains available.

---

## Phase 8 prompt — Release hardening + public beta launch

**Goal**  
Prepare safe public beta launch with observability, rollback, and support playbooks.

**What to change**
- Add error monitoring and structured logs (frontend + Convex).
- Add migration-safe feature flags (cloud features can be disabled quickly).
- Add backup/export recovery docs and support flows.
- Add go-live checklist + rollback plan in docs.

**Likely files involved**
- `README.md`
- `docs/migration/*`
- frontend shell files for monitoring integration
- Convex functions for operational diagnostics

**Avoid breaking**
- Existing import/export path.
- Performance on core tabs.

**Acceptance criteria**
- Staging checklist green.
- Production smoke tests green.
- Rollback procedure tested once.

**Config/commands needed**
- staging deploy on Cloudflare + Convex
- production deploy after approvals

**How to test before moving on**
1. Run full end-to-end smoke (login, upgrade, cloud save, share, sync, export).
2. Simulate incident toggle (disable cloud writes) and recover.
3. Verify support runbook can restore a project from export.

---

## F) Testing checklist after each phase

For every phase, run this minimum matrix before proceeding:

1. **Core creation flow**: create/open/edit/save project.
2. **Import/export**: export `.shotlist`, import into fresh session, compare key entities.
3. **Script tab safety**: verify pagination and editing still behave per spec.
4. **Cross-tab integrity**: script -> scenes -> storyboard -> shotlist -> schedule -> callsheet still connected.
5. **Regression smoke**: browser refresh recovery + no console-breaking errors.
6. **Build checks**:
   - root app: `npm run build`
   - shared: `cd shared && npm run build`
   - mobile: `cd mobile && npm run build`

---

## G) Launch checklist

1. Cloudflare Pages production project configured with `/` landing + `/app` app routing.
2. Convex production deployment healthy and schema finalized.
3. Stripe production product/price IDs confirmed in env vars.
4. Auth production keys and callback URLs verified.
5. End-to-end paid upgrade test completed in production-like environment.
6. Shared project invite flow tested with two real accounts.
7. Script collaboration guardrails tested under concurrent edit.
8. Import/export fallback verified for free users.
9. Monitoring/alerts enabled.
10. Rollback plan documented and rehearsed.

---

## H) What to do after Public Beta

1. Measure collaboration pain points (where locks are too strict/too loose).
2. Add richer conflict resolution (scene patch diffs, guided merges).
3. Introduce comment threads and review workflows per scene/script block.
4. Expand billing model (team seats, annual discounts, promo campaigns).
5. Add admin dashboard for support tooling (project recovery, entitlement inspection).
6. Evaluate deeper realtime model (OT/CRDT) only after telemetry confirms need.
7. Keep free local mode polished as a permanent acquisition funnel.

---

## Manual vs Codex vs Deployment responsibility split

### Zac does manually
- Account creation and billing/auth/provider setup.
- Dashboard configuration in Convex/Cloudflare/Stripe.
- Domain/DNS updates and production approval.

### Codex changes in code
- Routing/build restructuring.
- Convex schema/functions.
- Frontend auth/persistence/sharing/collab/billing integration.
- Documentation and runbooks.

### What gets deployed where
- **Cloudflare Pages**: landing + `/app` frontend assets.
- **Convex**: database, queries/mutations/actions, storage, webhook handlers.
- **Stripe**: products/prices/subscriptions/promos/customer portal.
