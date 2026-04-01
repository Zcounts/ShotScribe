# ShotScribe Public-Beta Access Policy (Canonical)

Date: 2026-04-01  
Scope: policy centralization for entitlement/access checks only (no broad UI rollout).

## Product policy source of truth

### Free tier
- Local-only projects.
- Import/export supported.
- No cloud save.
- No cloud collaboration.
- No cloud asset storage/access.

### Paid cloud tier
- Authenticated account.
- Cloud-backed projects.
- Shared cloud projects.
- Live sync.
- Cloud asset storage/access.
- Stripe-managed subscription access.

### Collaboration and billing constraints
- Every collaborator must have a paid cloud account (or manual grandfathered/comped paid-equivalent access).
- Admin role is independent from paid status.
- If billing is inactive:
  - Cloud projects are view-only.
  - Cloud projects cannot be edited.
  - Cloud projects cannot be exported.
  - Cloud-hosted assets cannot be accessed.
  - Local-only functionality continues to work.

## Canonical helper layer

Shared canonical helpers now live in:

- `shared/src/policies/accessPolicy.ts`

Helpers:
- `isLocalOnlyUser`
- `hasPaidCloudAccess`
- `canAccessCloudProject`
- `canEditCloudProject`
- `canExportCloudProject`
- `canAccessCloudAssets`
- `canCollaborateOnCloudProject`
- `isGrandfatheredOrComped`
- `isAdmin`

## Backend policy adapter (current wiring)

Convex adapter and guard functions:

- `convex/accessPolicy.ts`
  - `assertHasPaidCloudAccess`
  - `assertCanEditCloudProject`
  - `assertCanCollaborateOnCloudProject`
  - `assertCanAccessCloudAssets`
  - `assertCanExportCloudProject` (introduced for rollout follow-up wiring)
  - `getCloudPolicySummary`

## Re-audit of touched enforcement files

- `convex/billing.ts`
  - Uses canonical paid-access resolver and includes profile-based manual access flags.
- `convex/projects.ts`
  - Cloud create/seed gated by centralized paid-cloud access check.
- `convex/projectSnapshots.ts`
  - Cloud write path uses canonical cloud-edit guard.
- `convex/projectMembers.ts`
  - Invite/revoke/role-change collaboration actions use canonical collaboration guard.
  - Invite acceptance enforces paid cloud access for collaborator accounts.
- `convex/assets.ts`
  - Asset upload/write uses canonical cloud-edit guard.
  - Asset read uses canonical cloud-asset-access guard.
- `convex/schema.ts`, `convex/users.ts`
  - Adds/stamps optional profile flags for grandfathered, comped, and admin policy inputs.

## Notes for later phases

- This phase intentionally centralizes policy logic and server-side wiring only.
- UI rollout of read-only/export-disabled messaging should consume this same policy layer in follow-on phases.
