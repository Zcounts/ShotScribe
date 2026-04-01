# Admin Role Bootstrap and Management Runbook

Date: 2026-04-01  
Scope: internal admin-role assignment and in-app admin console operations for ShotScribe.

## Purpose

ShotScribe admin access is an **internal operational role** and is independent from billing/paid cloud status.

- Paid users are **not** automatically admins.
- Admin role is stored on `accountProfiles.isAdmin`.
- Assignment is controlled server-side only.
- The internal admin console is available at `/admin` and is guarded by admin role checks on both UI and Convex queries/mutations.

## Prerequisites

1. Target user must already have signed in once (so `users` + `accountProfiles` rows exist).
2. `OPERATIONAL_ADMIN_TOKEN` must be set in Convex deployment env for token-based bootstrap/emergency assignment.

## Flow A: Bootstrap the first admin (one-time)

Use only when there are zero admins.

```bash
npx convex run admin:bootstrapFirstAdmin '{"adminToken":"<OPERATIONAL_ADMIN_TOKEN>","email":"dev1@shot-scribe.com"}'
```

Behavior:
- Requires valid operational admin token.
- Fails once any admin already exists.
- Sets `accountProfiles.isAdmin = true` for that user.

## Flow B: Assign/revoke admin using operational token (ops/emergency path)

Grant admin:

```bash
npx convex run admin:setAdminRoleWithToken '{"adminToken":"<OPERATIONAL_ADMIN_TOKEN>","email":"dev2@shot-scribe.com","isAdmin":true}'
```

Revoke admin:

```bash
npx convex run admin:setAdminRoleWithToken '{"adminToken":"<OPERATIONAL_ADMIN_TOKEN>","email":"dev2@shot-scribe.com","isAdmin":false}'
```

Safety:
- Prevents revoking the last remaining admin.

## Flow C: Assign/revoke admin as an already-admin user (normal path)

Once at least one admin exists, authenticated admins can manage other admins without passing the ops token.

Grant admin:

```bash
npx convex run admin:setAdminRole '{"email":"dev2@shot-scribe.com","isAdmin":true}'
```

Revoke admin:

```bash
npx convex run admin:setAdminRole '{"email":"dev2@shot-scribe.com","isAdmin":false}'
```

Safety:
- Caller must already be admin.
- Prevents revoking the last remaining admin.

## In-app admin console (day-one)

Route: `/admin`

Surface includes:
- Dashboard totals: signups, paid users, active subscriptions, grandfathered/comped users.
- Recent signups.
- Recent subscription changes (from `billingSubscriptions.updatedAt` stream).
- Search user by email.
- User detail inspection:
  - billing state and subscription state,
  - cloud access state,
  - plan and override flags,
  - owned/shared project counts,
  - admin role.
- Override-light controls:
  - set/clear comped access,
  - set/clear grandfathered access,
  - grant/revoke admin role.
- Safe operational control exposure:
  - `cloud_writes_enabled` only (incident kill switch), with reason capture.

### Guardrails

- All admin console data/actions require authenticated admin role checks in Convex (`requireCurrentAdmin`).
- UI is read-heavy by design; only small manual overrides are exposed.
- Every override/role mutation and cloud write kill-switch update requires a confirmation prompt.
- Stripe coupon/promo creation is intentionally **not** implemented in-app; use Stripe Dashboard.

## Verify admin state

Current signed-in user:

```bash
npx convex run admin:getMyAdminState
```

List all admins (admin-only):

```bash
npx convex run admin:listAdmins
```

Admin dashboard snapshot (admin-only):

```bash
npx convex run admin:getAdminDashboardOverview
```

Inspect admin-safe ops controls:

```bash
npx convex run admin:getSafeOperationalControls
```

Billing entitlement surface also returns admin status for frontend guards:
- `billing:getMyEntitlement -> isAdmin`

## Admin-only feature guard guidance (frontend)

Use `AdminFeatureGuard` for internal admin screen/components.

- File: `src/features/admin/AdminFeatureGuard.jsx`
- Hook: `src/features/admin/useAdminAccess.js`

This keeps admin UX isolated from paid membership checks.
