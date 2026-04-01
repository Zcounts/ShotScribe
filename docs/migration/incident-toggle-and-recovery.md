# Incident Toggle and Recovery Playbook

Last updated: 2026-04-01

## Purpose

Provide a migration-safe way to quickly reduce blast radius by disabling cloud writes while preserving read access and export paths.

## Feature flags

- Flag key: `cloud_writes_enabled`
- Default behavior: enabled when flag is absent.
- Enforced in Convex write mutations for projects, snapshots, assets, and sharing writes.

## Preconditions

- Convex env var `OPERATIONAL_ADMIN_TOKEN` set.
- Incident commander has authenticated ShotScribe account and token access.

## Disable cloud writes

```bash
npx convex run ops:setOperationalFlag '{"adminToken":"<OPERATIONAL_ADMIN_TOKEN>","key":"cloud_writes_enabled","enabled":false,"reason":"incident-<id>"}'
```

## Verify disablement

```bash
npx convex run ops:getOperationalDiagnostics
```

Expected: `cloudWritesEnabled: false`.

## User-facing support guidance during disablement

1. Ask user to export current local project copy.
2. Inform user cloud updates are temporarily paused.
3. Keep read-only investigation going from diagnostics/events.

## Re-enable cloud writes

```bash
npx convex run ops:setOperationalFlag '{"adminToken":"<OPERATIONAL_ADMIN_TOKEN>","key":"cloud_writes_enabled","enabled":true,"reason":"incident-resolved"}'
```

## Post-incident checks

1. Run end-to-end smoke: login, upgrade, cloud save, share, sync, export.
2. Confirm operational diagnostics show healthy event flow.
3. Update incident log with start/end timestamps and impacted users.
