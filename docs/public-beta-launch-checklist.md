# Public Beta Launch Checklist (Canonical)

Date: 2026-04-01

Use this as the single go-live checklist for beta launches.

## 1) Preflight (must be green)

- [ ] `npm run build` succeeds at repo root.
- [ ] `cd shared && npm install && npm run build` succeeds.
- [ ] `cd mobile && npm install && npm run build` succeeds.
- [ ] Convex deploy has completed cleanly for target environment.
- [ ] All required env vars from `docs/public-beta-env-setup.md` are present.
- [ ] Stripe webhook endpoint is healthy and signing secret matches Convex env.
- [ ] At least one internal admin can access `/admin`.

## 2) Product smoke (owner + collaborator)

- [ ] Paid owner can sign in and open cloud project.
- [ ] Checkout launches for free user and returns to root/account path.
- [ ] Billing portal launches for subscribed user.
- [ ] Owner can invite collaborator; collaborator can accept via `/accept-invite`.
- [ ] Shared project opens for paid collaborator and snapshot save succeeds.
- [ ] Presence and screenplay lock UX appear for two-user edit session.
- [ ] Inactive/unpaid collaborator is blocked from shared cloud collaboration access.

Reference: `docs/collaboration-smoke-tests.md`.

## 3) Asset smoke

- [ ] Paid owner can upload supported image types.
- [ ] Paid collaborator can view cloud-hosted images.
- [ ] Inactive/read-only member cannot fetch cloud-hosted assets.
- [ ] Local-only storyboard image workflows still function.

Reference: `docs/cloud-image-uploads-beta.md`.

## 4) Admin/ops readiness

- [ ] `/admin` shows totals: signups, paid users, active subscriptions.
- [ ] `/admin` shows recent signups and recent subscription changes.
- [ ] `/admin` shows cloud/shared project counts for operator visibility.
- [ ] `cloud_writes_enabled` is ON before announcing launch.

## 5) Deployment (SiteGround manual artifact flow)

- [ ] Build SiteGround artifact: `npm run build:web`.
- [ ] Verify `dist-siteground/index.html` exists.
- [ ] Package and upload SiteGround artifact via current manual process.
- [ ] Verify root routes:
  - `/`
  - `/account`
  - `/admin`
  - `/accept-invite?token=<token>`

## 6) Launch comms + support handoff

- [ ] Link support to `docs/public-beta-support-checklist.md`.
- [ ] Link on-call to `docs/public-beta-rollback-checklist.md`.
- [ ] Record release timestamp and deployed commit hash in ops notes.
