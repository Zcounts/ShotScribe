# ShotScribe

ShotScribe is in **public beta** with a **web-first** product direction.

This repository currently contains:
- main web app (`src/`)
- Convex backend (`convex/`)
- mobile companion web app (`mobile/`)
- shared cross-app contracts/utilities (`shared/`)
- legacy Electron shell kept for fallback/archive (`electron/`)

---

## Current confirmed working state (April 2026)

- `/account` works in production and shows account + billing status.
- `/admin` works in production and loads the internal admin console for admins.
- Real signed-in production admin identity resolves correctly again.
- One-time admin repair flow exists for split/synthetic identity recovery.
- Local-only mode remains supported when cloud auth/env is not configured.
- Current auth/account/admin behavior is intentionally preserved.

---

## Stack (current)

- **Frontend:** React + Vite
- **Backend/data:** Convex
- **Auth:** Clerk + Convex (`convex/react-clerk` on frontend, Convex auth identity on backend)
- **Billing:** Stripe-backed subscription wiring in Convex (checkout/portal session creation + webhook sync)
- **Mobile companion:** React + Vite app in `/mobile`
- **Shared contracts:** TypeScript package in `/shared`

---

## Auth and account/admin model

### Cloud-enabled mode
When `VITE_ENABLE_CLOUD_FEATURES=true` and Clerk/Convex env vars are present:
- frontend wraps app in Clerk + Convex auth providers
- signed-out users are redirected to sign-in for protected cloud routes
- account page (`/account`) reads:
  - Clerk session state
  - canonical Convex current user
  - billing entitlement summary
- admin UI (`/admin`) is gated by `accountProfiles.isAdmin` (not by paid status)

### Local-only mode
When cloud mode/env is absent:
- app still runs in local-only workflows
- `/account` and `/admin` render safe “not configured” states rather than crashing
- no Clerk sign-in requirement is enforced for local workflows

---

## Convex + Clerk integration (current behavior)

- User identity resolution is **canonicalized** server-side.
- Primary match is `tokenIdentifier`; fallback is normalized email when needed.
- Duplicate/split rows are handled conservatively by selecting the most recently updated matching row and preserving profile/admin flags onto canonical profile where applicable.
- Entitlement query (`billing:getMyEntitlement`) is the frontend source for cloud access + admin flag display state.

---

## Billing/Stripe state (realistic)

Implemented now:
- Stripe Checkout session creation
- Stripe Billing Portal session creation
- webhook-driven subscription sync into Convex billing tables
- launch-plan guardrails (entitlement granted only for configured launch `STRIPE_PRICE_ID`)
- account-page reconciliation action after checkout/portal return (`billing:syncMyBillingState`)
- entitlement computation (paid/trialing/manual override/local-only)

Operational reality:
- billing behavior depends on correct Convex + Stripe env configuration
- Stripe dashboard remains source of truth for promo/coupon operations
- this repo intentionally keeps billing logic conservative and ops-friendly

---

## Production deployment model (high level)

Current production process is still **artifact build + manual hosting upload**.

High-level flow:
1. Build web artifact at repo root.
2. Upload built artifact to current hosting target.
3. Deploy Convex functions/schema with production Convex deployment.
4. Ensure production env vars are set for Clerk/Stripe/admin token.

Reference docs:
- `docs/public-beta-env-setup.md`
- `docs/billing-stripe-runbook.md`
- `docs/admin-role-runbook.md`

---

## Environment notes (current)

Frontend env (root app):
- `VITE_ENABLE_CLOUD_FEATURES`
- `VITE_CONVEX_URL`
- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_SENTRY_DSN` (optional; enables Sentry in production builds only)
- `VITE_CLARITY_PROJECT_ID` (optional; enables Microsoft Clarity in production builds only)
- `VITE_APP_ENV` (optional; sent to Sentry as `environment`, for example `production`/`staging`)
- `VITE_APP_RELEASE` (optional; sent to Sentry as `release`, for example git SHA)
- `VITE_MONITORING_ENDPOINT` (optional)

Mobile frontend env (`mobile/` app):
- `VITE_SENTRY_DSN` (optional; production builds only)
- `VITE_CLARITY_PROJECT_ID` (optional; production builds only)
- `VITE_APP_ENV` (optional)
- `VITE_APP_RELEASE` (optional)

Observability initialization behavior:
- Sentry initializes only when `import.meta.env.PROD === true` and `VITE_SENTRY_DSN` is provided.
- Clarity initializes only when `import.meta.env.PROD === true` and `VITE_CLARITY_PROJECT_ID` is provided.
- Development builds skip both tools to avoid noisy local diagnostics.

Post-deploy verification (web + mobile):
1. Open the deployed app and confirm a Clarity session appears in the Clarity dashboard.
2. Trigger a controlled client error in browser devtools and verify it appears in Sentry with the expected `environment` and `release`.
3. Confirm no Clarity script requests and no Sentry startup traffic occur in local `npm run dev` sessions unless explicitly configured and built as production.

Convex env (production as needed):
- `AUTH_ISSUER_URL`
- `AUTH_AUDIENCE`
- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`
- `OPERATIONAL_ADMIN_TOKEN`
- optional invite URL base (`INVITE_URL_BASE` or `CONVEX_INVITE_URL_BASE`)

---

## Internal admin recovery mini-runbook

### 1) First admin bootstrap (one-time)
Use when there are zero admins:

```bash
npx convex run admin:bootstrapFirstAdmin '{"adminToken":"<OPERATIONAL_ADMIN_TOKEN>","email":"<admin-email>"}'
```

### 2) Repair admin for the currently signed-in real Clerk user
Use when split identity/synthetic rows caused admin mismatch:

```bash
npx convex run admin:repairAdminForCurrentUser '{"adminToken":"<OPERATIONAL_ADMIN_TOKEN>"}'
```

Notes:
- run as the **real Clerk user** session in Convex dashboard function runner (“Act as user”)
- this path is intentionally retained for production safety

### 3) About synthetic/duplicate/no-email rows from prior debugging
- historical manual/debug activity can leave duplicate or synthetic user rows (sometimes no-email)
- treat those rows as **non-canonical noise** unless they are actively mapped to the current Clerk token
- immediate guidance: ignore unless they cause a live auth/admin incident
- if cleanup is needed, perform as a separate explicit maintenance task (not in normal feature work)

---

## Local development / build

### Main web app (root)
```bash
npm install
npm run dev:web
```

### Production web build artifact
```bash
npm run build
```

### Shared package
```bash
cd shared
npm install
npm run build
```

### Mobile app
```bash
cd mobile
npm install
npm run build
```

---

## Guardrails for stabilization work

- Keep auth/admin/account behavior stable.
- Prefer small, reversible changes.
- Avoid broad routing/auth rewrites during hardening passes.
- If cleanup is risky, defer and document instead of forcing it.

---

## Save/sync behavior

- Editing is **local-first** on all surfaces (web, desktop, mobile).
- **Free / local users** stay local-only — no cloud writes, ever.
- **Paid cloud users** edit a local working copy first; cloud snapshot sync is layered on top via a debounced queue (8 s on desktop/web, 6 s on mobile).
- Shot edits on mobile are persisted to localStorage immediately (safe offline), then uploaded to the same Convex project snapshot that desktop reads.
- Toolbar shows a status dot that transitions through: not yet saved → saved on device → uploading (dot pulses) → backed up to cloud / backup failed.
- Unsaved-change exit guards fire only while local persistence is genuinely pending; they do not block when cloud sync is merely queued.
- Full implementation detail + manual QA checklist: `docs/save-sync-architecture.md`.

## Mobile companion modes (April 2026 update)

ShotScribe mobile now supports **two explicit workflows**:

1. **Local File Mode** (no login required)
   - Import `mobile-day-package` / `mobile-snapshot` JSON files.
   - Edit on-set fields on device (shot status, notes, actual timing, script supervisor notes).
   - Export an updated snapshot JSON from mobile after edits.
   - Local edits stay local unless you manually move that exported file elsewhere.

2. **Cloud Project Mode** (paid cloud users)
   - Sign in with the existing Clerk + Convex auth stack.
   - Membership/entitlement is checked via `billing:getMyEntitlement`.
   - Browse accessible cloud projects from `projects:listProjectsForCurrentUser`.
   - Open a cloud project, edit on-set fields, and sync updates back to the same cloud project via snapshot writes.
   - Cloud mode is intended for on-set workflows and collaboration continuity, not full desktop feature parity.

### Mobile UX behavior

- The app header shows the active mode (`Local File Mode` vs `Cloud Project Mode`) at all times.
- A new **Script Supervisor** tab is included in mobile.
- Callsheet remains view-only on mobile.

### Supported mobile edits

- Shot status (`todo`, `done`, `skipped`)
- Shot / production notes
- Script supervisor notes
- Actual start/end timestamps (per shot)

### Sync model

- **Local mode:** file-based, fully offline. Shot edits written to localStorage immediately.
- **Cloud mode:** shot edits written to localStorage first (safe), then debounced cloud snapshot
  write fires ~6 s after the last change. The same Convex snapshot that desktop opens is updated,
  so status changes made on mobile appear on desktop when the project is next opened.
  A sync state banner ("uploading…" / "backed up to cloud · HH:MM" / "cloud backup failed") is
  shown in the app header during cloud mode.
