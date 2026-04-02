# Public Beta Support Checklist

Use this as the canonical support triage checklist during public beta incidents.

## 1) Triage and classify

- [ ] Capture user/project identifiers, timestamp (UTC), and symptom summary.
- [ ] Classify incident type: auth/account, billing/entitlement, save/sync, export/import, collaboration, or mobile sync.
- [ ] Confirm whether issue is local-only or cloud-path specific.

## 2) Immediate safety checks

- [ ] Check current launch/rollback status in `docs/public-beta-launch-checklist.md` and `docs/public-beta-rollback-checklist.md`.
- [ ] If needed, coordinate with ops on cloud-write safety controls (`docs/archive/migration/incident-toggle-and-recovery.md`).

## 3) Path-specific runbooks

- Auth/admin access: `docs/admin-role-runbook.md`
- Billing/entitlement issues: `docs/billing-stripe-runbook.md`
- Save/sync behavior: `docs/save-sync-architecture.md`
- Mobile artifact handling: `docs/mobile-artifact-upload-guide.md`
- Export/restore support flow reference: `docs/archive/migration/support-export-restore-runbook.md`

## 4) Closeout

- [ ] Record root cause and mitigation in incident notes.
- [ ] Link any required cleanup/backlog actions to the next release checklist.
