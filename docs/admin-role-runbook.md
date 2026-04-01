# Admin Role Bootstrap and Management Runbook

Date: 2026-04-01  
Scope: internal admin-role assignment for ShotScribe in-app admin foundation.

## Purpose

ShotScribe admin access is an **internal operational role** and is independent from billing/paid cloud status.

- Paid users are **not** automatically admins.
- Admin role is stored on `accountProfiles.isAdmin`.
- Assignment is controlled server-side only.

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

## Verify admin state

Current signed-in user:

```bash
npx convex run admin:getMyAdminState
```

List all admins (admin-only):

```bash
npx convex run admin:listAdmins
```

Billing entitlement surface also returns admin status for frontend guards:
- `billing:getMyEntitlement -> isAdmin`

## Admin-only feature guard guidance (frontend)

Use `AdminFeatureGuard` for any future internal admin screen/components.

- File: `src/features/admin/AdminFeatureGuard.jsx`
- Hook: `src/features/admin/useAdminAccess.js`

This ensures admin-only UX remains isolated from paid membership checks.
