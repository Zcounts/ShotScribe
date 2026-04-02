# Public Beta Environment and Setup (Canonical)

Date: 2026-04-01  
Scope: production/staging setup for app-root deployment (`app.shot-scribe.com`) with Convex + Clerk + Stripe.

## Frontend env vars (Vite)

- `VITE_ENABLE_CLOUD_FEATURES` (`true` to enable cloud/auth paths)
- `VITE_CONVEX_URL`
- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_SENTRY_DSN` (optional; Sentry browser SDK DSN)
- `VITE_CLARITY_PROJECT_ID` (optional; Microsoft Clarity project ID)
- `VITE_APP_ENV` (optional; defaults to Vite mode)
- `VITE_APP_RELEASE` (optional; release label such as git SHA)
- `VITE_MONITORING_ENDPOINT` (optional)

Notes:
- Keep `VITE_ENABLE_CLOUD_FEATURES=false` for local-only-only environments.
- Domain-root routing is expected (`/`, `/account`, `/admin`, `/accept-invite`).
- Sentry + Clarity initialize only in production bundles (`import.meta.env.PROD === true`) and only when their IDs are provided.
- The same observability env names are used by both the main app and the mobile web app build.

## Convex env vars

- `AUTH_ISSUER_URL`
- `AUTH_AUDIENCE`
- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`
- `OPERATIONAL_ADMIN_TOKEN`
- `INVITE_URL_BASE` or `CONVEX_INVITE_URL_BASE` (optional override for invite links)

## Stripe requirements

- Product + recurring price (`STRIPE_PRICE_ID`)
- Billing portal enabled
- Webhook endpoint set to:
  - `https://<convex-deployment>/stripe/webhook`
- Required webhook events:
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

See also: `docs/billing-stripe-runbook.md`.

## Admin bootstrap requirements

1. Target user signs in once (ensures `users` + `accountProfiles` rows exist).
2. Bootstrap first admin with `OPERATIONAL_ADMIN_TOKEN`.
3. Verify admin state before using `/admin`.

See also: `docs/admin-role-runbook.md`.

## Observability post-deploy verification

1. Open the production main app and mobile app once so both create fresh sessions.
2. In browser devtools network tab, verify Clarity loader request is present:
   - `https://www.clarity.ms/tag/<VITE_CLARITY_PROJECT_ID>`
3. Trigger a controlled frontend exception and confirm a Sentry issue appears with:
   - expected environment (`VITE_APP_ENV` or build mode)
   - expected release (`VITE_APP_RELEASE`, when configured)
4. Confirm local `npm run dev` sessions do **not** initialize Sentry/Clarity by default.
