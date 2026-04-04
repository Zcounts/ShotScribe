# Ensure Storyboard Live Model: diagnostics + retry-throttle pass

Date: 2026-04-04

## What changed

This pass intentionally makes only **low-risk, additive** client changes in `CloudSyncCoordinator`:

1. Added targeted diagnostics around `projects:ensureStoryboardLiveModel` failures (dev-only console logging).
2. Added an in-memory per-project failure record with cooldown throttling to prevent repeated immediate retries.
3. Added a short TODO note for the likely next pass (server-side legacy payload normalization/fallback).

No migration logic, schema, or business rules were changed.

## Why this is low risk

- Scope is isolated to the `ensureStoryboardLiveModel` effect in `CloudSyncCoordinator`.
- Successful projects still follow the same path and should migrate normally.
- Failing projects are no longer hammered repeatedly in tight loops; they retry after a cooldown.
- No UI/styling changes.
- No changes to project load/save flows, snapshot creation, or server-side mutation behavior.

## Cooldown strategy

- Cooldown window: **2 minutes** (`ENSURE_STORYBOARD_LIVE_MODEL_COOLDOWN_MS = 120000`).
- Stored in-memory per project ID (component-lifetime scoped):
  - `lastFailureAt`
  - `attemptCount`
  - `lastErrorSignature`
  - `gateSignature` (derived from `liveModelVersion` + editability)
  - `lastThrottleLogAt`
- Retries are throttled only when the previous failure is still inside cooldown and gate state has not changed.
- Failure record clears automatically when gate state changes (e.g. version/access changes), or after successful ensure call.
- Not permanent suppression: retries resume after cooldown.

## Diagnostics now emitted (dev-only)

On failure:
- `projectId`
- `liveModelVersion`
- `canEditCloudProject`
- sanitized `errorName`, `errorMessage`, `errorCode` (if available)
- `attemptCount`
- `repeatFailure` boolean
- cooldown value

On throttled repeat:
- `projectId`
- `liveModelVersion`
- `canEditCloudProject`
- `attemptCount`
- `lastErrorSignature`
- `cooldownRemainingMs`

Logs are scoped to this mutation path and avoid snapshot payload dumps.

## Signals to watch next

1. Do failure messages consistently indicate missing/invalid storyboard snapshot shape?
2. Are failures now reduced from repeated spam to one failure + periodic throttled retries?
3. Do errors split into clear buckets:
   - legacy-shape mismatch
   - permissions/auth
   - cloud writes disabled
   - unexpected server errors

## Recommended next step (explicit)

Patch migration to support legacy payloads that do not yet have `payload.scenes`.

Specifically, in `ensureStoryboardLiveModel`, add server-side normalization/fallback from legacy shape to a scenes array before migration.

## Follow-up observation after first pass

- Client-side cooldown reduced retry loops within a single mounted coordinator instance, but did not eliminate production noise because the backend mutation still failed for legacy payloads and failure cache could reset on remount/reload boundaries.
- Additional websocket reconnect noise (`1011`, `1013`) can amplify repeated attempts once connectivity returns; this indicates the root problem must be fixed server-side, not only throttled client-side.
