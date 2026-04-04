# Ensure storyboard live model: legacy payload fix

Date: 2026-04-04

## Why the first throttle pass did not fully solve it

The client-only cooldown reduced immediate retries inside a single mounted `CloudSyncCoordinator`, but it did not fix the underlying mutation failure.

Key reasons repeated error noise could continue:
1. The server mutation still rejected legacy snapshot payloads that lacked `payload.scenes`.
2. Reconnect/remount/reload boundaries can reset client in-memory throttle state.
3. Websocket instability (`1011`/`1013`) can trigger additional mutation attempts after reconnect.

Conclusion: client throttle helps, but root cause needed a server-side payload normalization fix.

## Legacy shapes accounted for in this pass

`ensureStoryboardLiveModel` now attempts normalization from these payload paths (in order):
1. `payload.scenes` (modern shape)
2. `payload.storyboard.scenes`
3. `payload.shots` (legacy single-scene)
4. `payload.storyboard.shots` (legacy nested single-scene)

If none yield usable storyboard scenes, mutation fails safely with a clear error and writes a narrow diagnostic event.

## What normalization was added

- Added a small scene normalizer that ensures expected scene fields and always materializes `shots` as an array.
- Added a resolver that picks a normalization source path and returns normalized scenes for migration.
- Existing migration write path (insert `projectScenes` / `projectShots`, then patch `liveModelVersion`) is unchanged in behavior for modern payloads.

## Server-side diagnostics added

`ensureStoryboardLiveModel` now writes narrow operational diagnostics:
- payload-shape summary flags (without dumping full payload)
- normalization source selected
- project/version context
- sanitized error fields when failures occur

Events added:
- `project.storyboard_live_model.ensure_invalid_payload`
- `project.storyboard_live_model.ensure_succeeded`
- `project.storyboard_live_model.ensure_failed`

## Why this fix is safe

- Scope limited to `ensureStoryboardLiveModel` migration path.
- No schema changes.
- No unrelated save/load logic rewrites.
- Modern valid payloads still use `payload.scenes` first.
- Legacy payload support only broadens accepted input into the same live-model write path.

## Verification plan

### 1) Healthy modern cloud project
- Open cloud project with `liveModelVersion < 1` and valid `payload.scenes`.
- Confirm migration succeeds once and project version flips to live model.
- Confirm no repeated ensure failure logs.

### 2) Failing legacy cloud project
- Open project whose snapshot has legacy top-level `shots` (or storyboard nested shots) without `payload.scenes`.
- Confirm migration now succeeds via normalized path and no repeated server-error spam.
- Confirm project behavior remains intact after reopen.

### 3) Missing/invalid storyboard data
- Open project with no usable storyboard scenes/shots data.
- Confirm mutation fails safely and logs `ensure_invalid_payload` diagnostics.
- Confirm app does not crash and remains in non-migrated state.

## Chart warning note

The chart warning about width/height <= 0 appears unrelated to storyboard-live migration unless proven otherwise; no chart code was changed in this fix.
