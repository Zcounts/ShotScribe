# ShotScribe

ShotScribe is in **public beta** with a **web-first** product direction.

This repository currently contains:
- the main web application (filmmaking workflow tabs)
- an auth landing experience
- Convex backend functions/schema
- a mobile web companion app (`/mobile`)
- shared cross-app contracts/utilities (`/shared`)
- legacy Electron desktop scaffolding kept as fallback/archive

---

## Current product status (repo reality)

### Working now
- Main web app with Script, Scenes, Storyboard, Shotlist, Cast/Crew, Schedule, and Callsheet flows.
- Convex backend schema and functions for users, projects, snapshots, sharing, presence, screenplay locks, assets, ops flags, and Stripe webhook ingestion.
- Clerk + Convex auth wiring in the frontend when cloud mode/env vars are enabled.
- Local-only mode fallback when cloud env is not configured.
- Google sign-in is expected to work through Clerk production configuration (provider settings are managed in Clerk dashboard, not in this repo).

### Partially working / in-progress
- Cloud project workflows exist in code, but production rollout still relies on feature flags/env setup and operational controls.
- Stripe billing integration exists in Convex (`billingSubscriptions` + webhook handler), but depends on production Stripe + Convex environment configuration.
- Shared project invites and collaboration controls exist, but should be validated with staging/production smoke tests before broad rollout.

### Not the priority for beta
- Desktop installer workflows are not the primary release path for public beta.
- Electron scripts/config remain in place for compatibility and fallback only.

---

## Domain and routing model

### Current production intent
- Marketing site: `https://shot-scribe.com`
- App: `https://app.shot-scribe.com`

### Current repository behavior
The app is configured for **domain-root behavior** (for example `https://app.shot-scribe.com/`):
- main app entrypoint at `index.html`
- auth redirect URLs pointed to `/`
- SPA fallback rewrite to `index.html`
- legacy `/app` routes redirected to `/`

---

## Stack (current)

- **Frontend:** React + Vite
- **Backend/data:** Convex
- **Auth:** Clerk (integrated with Convex via `convex/react-clerk`)
- **Billing backend wiring:** Stripe webhook handling in Convex
- **Current production hosting process:** SiteGround manual upload
- **CI build packaging:** GitHub Actions artifact workflows

---

## Environment configuration

Main frontend runtime flags:
- `VITE_ENABLE_CLOUD_FEATURES` (`true`/`false`)
- `VITE_CONVEX_URL`
- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_MONITORING_ENDPOINT` (optional)

Convex/backend env requirements (as used by current code/docs):
- `AUTH_ISSUER_URL`
- `AUTH_AUDIENCE`
- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`
- `OPERATIONAL_ADMIN_TOKEN`
- optional invite URL base (`INVITE_URL_BASE` or `CONVEX_INVITE_URL_BASE`)

Billing setup runbook:
- `docs/billing-stripe-runbook.md`

---

## Local development

### Main web app (root)
```bash
npm install
npm run dev:web
```

### Production web build artifact (SiteGround mode)
```bash
npm run build:web
```
Output: `dist-siteground/`

### Preview SiteGround-mode build
```bash
npm run preview:web
```

### Shared package
```bash
cd shared
npm install
npm run build
```

### Mobile web companion
```bash
cd mobile
npm install
npm run build
```

---

## Deployment (current reality)

### What is automated
GitHub Actions builds production artifacts.

### What is manual
Deployment to current production hosting is still manual (SiteGround upload of built artifact).

### Workflow: production web artifact
Workflow file:
- `.github/workflows/siteground-static-package.yml`

Behavior:
1. Runs on push to `main` (and manual dispatch).
2. Installs dependencies.
3. Runs `npm run build:web` (SiteGround mode).
4. Verifies `dist-siteground/index.html`.
5. Creates `shot-scribe-siteground-package.zip` from `dist-siteground`.
6. Uploads artifact `shot-scribe-siteground-package`.

Use that zip for manual SiteGround upload.

### Workflow: mobile web artifact
Workflow file:
- `.github/workflows/mobile-web-build.yml`

Behavior:
1. Builds shared + mobile packages.
2. Uploads `mobile/dist` as artifact `mobile-web-dist`.

---

## Known mismatches to clean up next

1. **Legacy `/app` compatibility debt**
   - Legacy `app/` entry artifacts still exist in the repo and can be removed after rollout confidence is high.
2. **Docs drift**
   - Some docs still describe older static/local-only posture and/or Cloudflare-target plans that are not the active production deployment process.
3. **Legacy desktop messaging**
   - Desktop scripts remain, but README and supporting docs should continue clarifying they are fallback, not beta priority.
4. **Auth provider status clarity**
   - Google auth is confirmed as working in production Clerk setup; GitHub provider status should be explicitly verified and documented from dashboard state.
5. **Deployment runbook consolidation**
   - Keep one canonical “how production deploy works today” document aligned with SiteGround manual upload + GitHub artifact flow.

---

## Repository structure

- `src/` — main web app frontend
- `convex/` — backend schema/functions
- `mobile/` — mobile web companion app
- `shared/` — shared contracts/types/utilities
- `site/` / `landing/` — landing/static assets and supporting files
- `electron/` — legacy desktop shell
- `docs/` — migration, runbooks, and specs

---

## Public beta focus

Current priority is stable public beta operation of the web app with:
- practical production workflows
- cloud-backed capabilities where enabled
- manual but reliable production deployment
- clear operational controls (including cloud-write kill switch)

Keep changes incremental and documentation synchronized with actual shipped behavior.
