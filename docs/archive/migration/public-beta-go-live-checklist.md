# Public Beta Go-Live Checklist (Legacy Migration Copy)

Last updated: 2026-04-01

> Canonical checklist has moved to `docs/public-beta-launch-checklist.md`.  
> Canonical rollback steps have moved to `docs/public-beta-rollback-checklist.md`.

This file is kept for migration-history context only.

## Historical exit criteria

- [ ] Staging checklist green.
- [ ] Production smoke checklist green.
- [ ] Rollback procedure executed once in staging and documented.

## Staging deploy checklist (Cloudflare + Convex)

1. Deploy frontend preview build to Cloudflare Pages staging environment.
2. Deploy Convex functions/schema to staging deployment.
3. Confirm required env vars are set:
   - `VITE_ENABLE_CLOUD_FEATURES=true`
   - `VITE_CONVEX_URL`
   - `VITE_AUTH_ISSUER_URL`
   - `VITE_AUTH_AUDIENCE`
   - `VITE_AUTH_CLIENT_ID`
   - `VITE_MONITORING_ENDPOINT` (optional but recommended)
   - Convex `OPERATIONAL_ADMIN_TOKEN`
4. Run smoke flow in staging:
   - login
   - upgrade/check entitlement
   - cloud save
   - share invite
   - sync across a second session
   - export/import project
5. Validate diagnostics:
   - `npx convex run ops:getOperationalDiagnostics`
   - verify cloud write flag is enabled and events are flowing.

## Production go-live checklist

1. Confirm staging smoke test evidence is linked in release notes.
2. Tag release commit and keep prior production tag available for rollback.
3. Deploy Convex to production.
4. Deploy Cloudflare Pages production build.
5. Run production smoke flow (same sequence as staging).
6. Confirm support team has latest runbook links before announcing launch.

## Rollback plan (release-day)

### Trigger conditions

- Cloud save failures above acceptable threshold for >10 minutes.
- Share/sync incident affecting active productions.
- Data corruption detected in project snapshots.

### Immediate actions

1. Disable cloud writes:
   ```bash
   npx convex run ops:setOperationalFlag '{"adminToken":"<OPERATIONAL_ADMIN_TOKEN>","key":"cloud_writes_enabled","enabled":false,"reason":"release-incident"}'
   ```
2. Post status update to support channel with incident ID and timestamp.
3. Roll frontend to prior known-good Cloudflare deployment.
4. Roll Convex to prior release if needed.
5. Keep exports available for user recovery path.

### Recovery and re-enable

1. Validate fix in staging with full smoke flow.
2. Deploy fix to production.
3. Re-enable cloud writes.
4. Run one more production smoke pass.
5. Close incident with timeline and follow-ups.
