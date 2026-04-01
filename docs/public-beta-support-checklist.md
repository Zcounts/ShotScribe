# Public Beta Support / Operator Checklist (Canonical)

Date: 2026-04-01

Use this as the single first-line support workflow.

## 1) Triage intake (required fields)

- User email (account identity).
- Project ID/name (if cloud project issue).
- Exact UTC timestamp of failure.
- Feature affected:
  - billing/checkout/portal
  - invite/collaboration
  - cloud save
  - cloud assets
  - local-only/export/import
- Screenshot/error message text.

## 2) Quick classification

- **Billing/entitlement**: user cannot access cloud features or sees downgrade behavior.
- **Collaboration**: invite acceptance, membership, or shared project access issue.
- **Assets**: upload/fetch denied, render missing.
- **Ops incident**: cloud writes disabled or systemwide errors.

## 3) Operator checks (admin console first)

At `/admin`:
- Confirm `cloud_writes_enabled` state.
- Check dashboard totals + recent signups/subscription changes for anomalies.
- Search user by email and inspect:
  - billing state
  - subscription status
  - cloud access summary
  - owned/shared project counts
  - comped/grandfathered/admin flags.

## 4) Common fixes

- Billing stale/inactive:
  - ask user to open **Manage billing** from `/account`.
  - verify Stripe status propagated through webhook.
- Invite issues:
  - confirm invited email matches signed-in collaborator email.
  - verify token is unexpired and not revoked.
- Shared access denied:
  - verify collaborator has paid access (required for shared cloud collaboration).
- Asset access blocked:
  - verify user entitlement is paid/override active and project membership exists.

## 5) Escalation criteria

Escalate to engineering/on-call when:
- multiple users fail same flow within short window,
- webhook sync appears delayed/broken,
- data integrity concern is reported,
- cloud writes need to be disabled.

For incident handling, switch to: `docs/public-beta-rollback-checklist.md`.
