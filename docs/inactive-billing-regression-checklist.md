# Inactive Billing Read-Only Regression Checklist

Date: 2026-04-01

Use this checklist whenever touching entitlement/billing/cloud access behavior.

## Policy expectations (cloud projects)

When billing is inactive/read-only for a previously paid user:
- Cloud project data can be viewed.
- Cloud project edits are blocked.
- Cloud project export is blocked.
- Cloud-hosted image asset access is blocked.
- Local-only workflows still work (create/open/save/import/export).

## Test matrix

### 1) Active paid user
- Open cloud project and confirm normal editing remains available.
- Confirm Script tab Write mode, scene lock, and snapshot save work.
- Confirm cloud image upload and render work.
- Confirm cloud export actions are available.
- Confirm collaboration invite/revoke/role edit still works for owner.

### 2) Canceled user (period ended/inactive)
- Open an existing cloud project and confirm it opens in read-only state.
- Confirm Script write mode is disabled and save snapshot is blocked with a billing message.
- Confirm collaboration controls are blocked and messaging points to billing/account management.
- Confirm export entry point is blocked and local-only export guidance is shown.
- Confirm cloud images do not render and cloud image upload is blocked.

### 3) Payment-failed/inactive user
- Repeat canceled-user checks with `subscriptionStatus=payment_failed` or equivalent inactive state.
- Confirm no cloud asset fetch path is available.
- Confirm local-only save/import/export still function.

### 4) Grandfathered/comped user
- Confirm paid-equivalent access continues for cloud edit/export/assets.
- Confirm no read-only downgrade messaging appears.

### 5) Local-only free user
- Confirm local project create/open/save/import/export all work.
- Confirm cloud-only actions are unavailable unless account upgrades.
- Confirm local image workflows continue unchanged.

## Collaboration downgrade edge case

- Use a shared cloud project with owner + collaborator.
- Downgrade collaborator to inactive billing.
- Confirm collaborator can still open/view project data but cannot:
  - acquire scene locks,
  - save snapshots,
  - access cloud-hosted assets,
  - perform sharing/collaboration mutations.
- Confirm active paid owner can continue collaboration operations.

