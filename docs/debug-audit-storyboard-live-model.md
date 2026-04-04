# Debug Audit: repeated `[CONVEX M(projects:ensureStoryboardLiveModel)] Server Error`

Date: 2026-04-04  
Repo: `ShotScribe`  
Scope: Web app + Convex path for `projects:ensureStoryboardLiveModel`

---

## TL;DR

Most likely root cause is **legacy cloud snapshot shape mismatch**:

- `ensureStoryboardLiveModel` currently only migrates when `latestSnapshot.payload.scenes` exists and is an array.
- Older/legacy payloads can still be valid for app runtime (`loadProject` supports legacy single-scene / `shots` shape), but **will fail this migration precondition**.
- On failure, the client swallows the error in code (`.catch(() => { ... })`), while Convex still prints the server error in DevTools as `[CONVEX M(projects:ensureStoryboardLiveModel)] Server Error`.
- Because retry de-duplication is cleared on each failure, the mutation can be retried repeatedly and spam logs.

The app may appear functional because snapshot-based load/save still works even when live-model migration fails.

---

## 1) End-to-end path audit

## Where `projects:ensureStoryboardLiveModel` is defined

- `convex/projects.ts` → `export const ensureStoryboardLiveModel = mutation({...})`
- Key behavior:
  - Requires auth + cloud writes + editor role.
  - No-op success if `project.liveModelVersion >= 1`.
  - Else reads `latestSnapshot.payload.scenes` and throws if missing/invalid.
  - If valid, migrates scenes/shots into `projectScenes` and `projectShots`, then patches project `liveModelVersion = 1`.

## Where it is called from client

Direct call site:

- `src/components/CloudSyncCoordinator.jsx`
  - `const ensureStoryboardLiveModel = useMutation('projects:ensureStoryboardLiveModel')`
  - Called in an effect when:
    - there is an active cloud project,
    - project exists,
    - `liveModelVersion < 1`,
    - user can edit cloud project,
    - and a per-project in-memory guard set doesn’t already contain the project key.

Additional repository wrapper exists but is not used by the main call path:

- `src/data/repository/cloudProjectAdapter.js` has `ensureStoryboardLiveModel(projectId)` wrapper.

## Which views/tabs trigger it

- `CloudSyncCoordinator` is mounted at app root (`App.jsx`) whenever cloud mode is enabled.
- So trigger is **not storyboard-tab specific**. It can happen while on Script/Home/any tab as long as a cloud project is open.

## Trigger mode (mount / tab switch / polling / retry)

Primary trigger is a `useEffect` in `CloudSyncCoordinator` keyed by project/access/version deps.

- This is effectively **project-open / project-state reactive**, not explicit tab-switch logic.
- On failure, catch handler removes the project key from the guard set, allowing future retries.
- Retries can recur as the effect re-runs from dependency updates (project query changes, access state changes, remounts, dev strict mode re-mounts, etc.).

---

## 2) Hot spot inspection results

## Storyboard live model init/migration logic

- Convex migration precondition is strict:
  - requires `snapshot.payload.scenes` to exist and be an array.
  - otherwise throws: `Project has no valid storyboard snapshot payload for migration`.

## Script tab vs storyboard tab interactions

- No direct Script-tab call to `ensureStoryboardLiveModel` found.
- Migration attempt is globally coordinated, independent of active tab.

## Hooks/effects when opening a project

- `openCloudProject` loads latest snapshot and sets cloud project state.
- Once cloud project state is set, `CloudSyncCoordinator` effect attempts migration if `liveModelVersion < 1`.

## Convex mutation/action wrappers

- No generic retry wrapper around this specific mutation.
- Call uses plain `useMutation` function and manual effect.

## Telemetry/logger wrappers

- I did not find app-level wrapper that transforms this specific error into the `[CONVEX ...]` prefix.
- That console line is consistent with Convex client error logging for failed mutations.
- Client code currently suppresses local handling (`catch` empty except guard reset), which makes server log look “loud” relative to UI impact.

## “Ensure even when not on storyboard” paths

- Confirmed: this ensure call is global and can run for any open cloud project regardless of active tab.

---

## 3) Impact assessment

## Is it harmless noise or real problem?

Current best assessment: **mostly hidden data-model migration failure + noisy retries**.

- Not purely harmless, because live-model migration never completes for affected projects.
- But user-visible breakage can be low if snapshot path remains healthy.

## Performance/request impact

- Likely causes unnecessary mutation attempts for affected projects (`liveModelVersion` stays 0).
- Each failed attempt still incurs auth/permission/query work in Convex and emits console errors.

## Frequency likelihood

Most likely frequency pattern:

- At minimum: when opening affected cloud project.
- Potentially repeated: whenever effect dependencies change and failure guard is reset (currently reset on every failure).
- Not tied to every render directly, but can reoccur often enough to appear “repeated” in console.

## Could this become user-facing bug?

Yes, medium risk over time:

- Any feature depending on live-model tables/version gate (`liveModelVersion >= 1`) will remain unavailable or stale for these projects.
- Current snapshot-based behavior can mask this until a live-model-dependent workflow is relied on.

---

## 4) Best root-cause hypothesis + evidence

## Hypothesis (highest confidence)

Affected project(s) have snapshot payloads accepted by runtime loader but rejected by migration precondition:

- Runtime loader supports legacy payloads with no `scenes` array (fallback to `shots`).
- Migration function requires `payload.scenes` array and throws otherwise.

This mismatch yields repeated server errors while app mostly still works.

## Evidence

1. Migration strict check:

- `convex/projects.ts`: throws when no `payload.scenes` array.

2. Runtime compatibility with legacy shape:

- `src/store.js` `loadProject`: if `data.scenes` missing, it migrates from old single-scene (`data.shots`) format.

3. Repeated attempts behavior:

- `src/components/CloudSyncCoordinator.jsx`:
  - attempts mutation whenever `liveModelVersion < 1` and editable cloud project.
  - on failure, removes retry guard key, enabling subsequent attempts.

4. Symptom match:

- Exactly named mutation in console (`projects:ensureStoryboardLiveModel`) and app “not obviously broken.”

---

## 5) Risk level

- **Product risk:** Medium (hidden migration debt; future live features can degrade).
- **Operational risk:** Low-to-medium (extra mutation noise/requests).
- **Immediate user-facing risk:** Low right now for snapshot-centric usage, but non-zero for live-model workflows.

---

## 6) Recommended next steps (safest → more invasive)

## Option A — Do nothing for now (safest immediate)

- Keep behavior as-is.
- Tradeoff: continued console/server noise + repeated unnecessary attempts + unresolved migration state.
- Acceptable only if you intentionally defer live-model rollout risk.

## Option B — Safe observability patch (very low risk)

- Add targeted error diagnostics around this mutation attempt only:
  - include projectId, current liveModelVersion, and sanitized error message/code.
  - rate-limit to avoid spam.
- Keep logic unchanged.
- Benefit: confirms whether failures are legacy payload vs permissions/ops flags in production-like environments.

## Option C — Retry-throttle guard (low risk, behavior-adjacent)

- Keep one failed-at timestamp / error signature per project in-memory.
- Avoid immediate re-attempt loops (e.g., cooldown 1–5 min) unless project/version changes.
- Reduces noise + request churn without changing migration semantics.

## Option D — Migration precondition hardening (moderate, likely correct fix)

- In `ensureStoryboardLiveModel`, support legacy payload fallback path:
  - if `payload.scenes` missing, derive one scene from legacy payload fields/shots (align with `loadProject` legacy behavior), then migrate.
- Must be done carefully + tested against existing snapshot shapes.
- This is likely the long-term real fix.

## Option E — One-off backfill job / admin tool (more invasive operationally)

- Write controlled script/action to backfill affected projects once, then stop runtime ensures from doing heavy migration.
- Better for large existing dataset; requires deployment/ops care.

---

## 7) Proposed implementation plan (for actual fix, not done in this audit)

1. Add minimal diagnostics first (Option B) and deploy to capture failing error signatures.
2. Implement retry-throttle guard in client effect (Option C) to stop noisy repeated attempts.
3. Implement server-side legacy fallback in `ensureStoryboardLiveModel` (Option D):
   - normalize snapshot payload into scenes array before validation,
   - keep idempotency (do nothing if already migrated / existing live rows).
4. Validate with targeted QA matrix:
   - modern projects (`payload.scenes`) migrate once.
   - legacy projects (`payload.shots` only) migrate once.
   - viewer/no-edit users do not attempt mutation.
   - cloud writes disabled returns stable UX without repeated spam.
5. Monitor Convex logs for drop in `projects:ensureStoryboardLiveModel` errors.

---

## 8) What I changed in this audit

- No runtime/business-logic fix implemented in this pass.
- Added this audit report only.

Rationale: Root cause is clear enough to plan safely; implementing data-shape fallback without a controlled QA pass is slightly beyond “minimal/no-risk” for this step.
