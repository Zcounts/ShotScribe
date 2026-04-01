# Public Beta Rollback Checklist (Canonical)

Date: 2026-04-01

Use this as the single rollback playbook for release-day incidents.

## Trigger conditions

- Sustained cloud save failures (for example >10 minutes).
- Shared collaboration flow broadly unavailable.
- Stripe billing events not syncing and causing entitlement breakage.
- Data integrity concerns in cloud snapshots/assets.

## Immediate containment

1. Disable cloud writes in admin console (`/admin`) by setting `cloud_writes_enabled` to OFF with incident reason.
2. Confirm disablement in `/admin` and/or:

```bash
npx convex run admin:getSafeOperationalControls
```

3. Post incident update with UTC timestamp and incident ID.

## Service rollback

1. Redeploy last known-good SiteGround artifact.
2. If needed, roll Convex functions/schema to last known-good deploy.
3. Keep read-only support flow active (users can still export/import local copies where applicable).

## Verification before re-enable

- [ ] Auth sign-in works.
- [ ] Cloud project reads work.
- [ ] Billing entitlement query returns expected values.
- [ ] Sharing and invite acceptance are healthy.
- [ ] Asset fetch path is healthy for entitled paid users.

## Recovery completion

1. Re-enable `cloud_writes_enabled`.
2. Run focused smoke:
   - paid owner cloud save
   - collaborator shared edit
   - asset upload + view
3. Close incident with:
   - start/end timestamps
   - impacted user scope
   - root cause summary
   - follow-up tasks.
