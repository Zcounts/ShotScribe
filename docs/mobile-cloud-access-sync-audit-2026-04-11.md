# ShotScribe Mobile access + sync architecture audit (April 11, 2026)

## Scope

- Focused on `mobile/` app behavior.
- Cross-checked against desktop/cloud flows in `src/` + `convex/` to ensure recommendations preserve existing production behavior.
- Goal: recommend a practical two-mode architecture for mobile:
  1. **Local File Mode** (JSON/package import)
  2. **Cloud Project Mode** (auth + cloud project open + controlled refresh)

---

## Executive summary

ShotScribe mobile already has the beginnings of both modes, but Cloud Project Mode is currently snapshot-centric and missing a durable cloud-cache boundary, asset-resolution strategy, and refresh contract. The biggest reliability risk for storyboard images is that mobile package payloads and cloud snapshot transforms currently carry only direct URL-style image fields (`shot.image` / `thumbnailUrl`) and do not preserve cloud asset identity (`imageAsset.cloud.assetId`) needed for re-signing expiring URLs.

### What is working

- Local JSON/package import pipeline exists and is stable for schedule + shot metadata.
- Mobile cloud auth providers are wired (feature flag + Clerk + Convex wrappers).
- Cloud project list + cloud snapshot read + cloud snapshot write are implemented.
- Edits are local-first with debounced cloud write.

### What is missing / risky

- Mobile cloud open path does not build a **versioned local cached working copy** per cloud project; it recomputes from live query data each render.
- Mobile cloud refresh logic is implicit via Convex query subscriptions rather than explicit low-chatter fetch/check behavior.
- Image references in mobile snapshot/package shape are URL-only; there is no asset-id-first model for expiring signed URLs.
- CloudModePane has references to `localActiveProject` / `localActiveDay` in cloud render logic (wrong scope), indicating mode-branch reliability issues.

---

## Current-state audit answers (requested questions)

## 1) Current cloud project data flow for desktop/full app

Desktop uses a two-stage cloud open flow:

1. `openCloudProject` fetches lightweight metadata only and sets `projectRef: { type: 'cloud', snapshotId: null }`.
2. `hydrateProjectSnapshot` later fetches the latest full snapshot and applies it, preserving active tab/project ref state.
3. Ongoing cloud saves are debounced and guarded with `expectedLatestSnapshotId` + conflict behavior.

This is implemented in store-level cloud actions and sync controls, not in view components directly.

## 2) Current mobile project loading flow

Mobile has two modes in one app component:

- **Local mode**: load local library from localStorage, open imported project/day directly.
- **Cloud mode**: if cloud providers/env are configured, query cloud project list and latest snapshot, transform cloud payload into mobile day packages, then render project hub.

The cloud path currently rebuilds a transient library from latest snapshot payload instead of materializing a persisted cloud cache entry keyed by cloud project + snapshot id.

## 3) How Local File Mode is implemented + JSON/package contents

- Import accepts JSON file, parses as either `mobile-snapshot` or `mobile-day-package` shared schema.
- Imported data is normalized into `StoredLibrary` and stored in localStorage.
- Package contract includes schedule items, storyboard refs, optional callsheet, and shot-level fields.

Local storage currently holds the full day package payload and separate `shotEdits` map keyed by `projectId::dayId::shotId`.

## 4) What is missing from JSON/package path (assets)

Main gap: package contracts carry URL-like image references (`shotImageUrl`, `thumbnailUrl`) but **not durable cloud asset identity** or re-signing metadata. That causes image fragility when URLs expire or are environment-bound.

Also, project IDs generated for desktop export are slug-based synthetic ids (`desktop-...`) rather than canonical cloud project IDs, which is fine for local mode but prevents direct cloud lineage linkage.

## 5) What is missing for true Cloud Project Mode on mobile

- Explicit cloud project browser/open flow with cached snapshot lifecycle states (`not_cached`, `cached_stale`, `cached_fresh`, `refreshing`).
- Version check strategy (`snapshotHead`/`updatedAt`) before downloading full snapshot.
- Asset resolver that uses asset IDs and refreshes signed URLs lazily.
- Clear reconciliation between local edits and refreshed cloud snapshot.

## 6) Auth/login flow needed for cloud access

Use Clerk session in mobile (already scaffolded), but gate cloud features behind:

1. cloud feature flag/env configured,
2. signed-in Clerk session,
3. entitlement check (`billing:getMyEntitlement`),
4. project-level access query.

Persist only a lightweight “last opened cloud project id + mode” client-side; rely on Clerk for secure session persistence.

## 7) Cloud project selection/opening UX flow (recommended)

1. User taps **Cloud Project Mode**.
2. If signed out -> show sign-in CTA.
3. After sign-in -> show cloud projects list (metadata only).
4. On open -> check snapshot head/version token.
5. If local cache missing or stale -> fetch latest snapshot once, transform, persist local working copy.
6. Open from local working copy immediately; display “synced X min ago” + manual refresh.

## 8) Best architecture for both modes without duplicated logic

Adopt a shared internal **Mobile Working Project** shape after load.

- Local import adapter -> converts package/snapshot into working project.
- Cloud snapshot adapter -> converts cloud payload into same working project.
- Rendering/editing uses one common store/view model.
- Mode-specific modules only handle source IO (file import/export vs cloud fetch/sync).

## 9) Keep server calls down in Cloud Project Mode

Use controlled, low-chatter sync:

- Metadata-first checks (snapshot head/version) before full payload fetch.
- Debounced write batching (already present) for edits.
- Manual refresh + optional throttled background check (e.g., every 60–120s only while active).
- No constant live subscriptions for mobile by default.
- Lazy/visible-only asset signed URL fetch with short-lived cache.

## 10) Smallest safe first implementation

Phase 1 should add cloud-cached-open + refresh controls without changing desktop behavior:

- Keep current snapshot-based cloud model.
- Add mobile-side cached cloud project record in localStorage keyed by `cloudProjectId` + `snapshotId`/`versionToken`.
- Add explicit “Refresh from cloud” action.
- Add image fallback/refresh path for expired URLs (initially URL retry + optional signed-view endpoint hook).

---

## Root causes for storyboard/media reliability issues

1. **URL-only image references in mobile contracts**
   - Mobile contract fields capture URL strings, but not cloud asset IDs.
   - Signed URLs can expire, breaking storyboard thumbnails with no deterministic rehydrate path.

2. **Cloud payload -> mobile transform ignores `imageAsset.cloud.assetId`**
   - Transformer uses `shot?.image` and maps to `shotImageUrl` / `thumbnailUrl` only.

3. **No dedicated mobile asset signing/resolution layer**
   - Desktop has signed-view caching helpers + Convex actions for batch signed view lookup.
   - Mobile path currently renders direct URLs and lacks equivalent resolver/caching.

4. **Mode separation bug risk in current mobile app composition**
   - Cloud pane references local variables in cloud branch, indicating fragile mode isolation and likely runtime regressions.

---

## Recommended target architecture

## A. Two explicit mobile modes

- **Local File Mode**
  - Import/open JSON package/snapshot from device.
  - Full offline editing on local working copy.

- **Cloud Project Mode**
  - Requires sign-in + entitlement.
  - Open cloud project into local cached working copy.
  - Save edits locally immediately, then upload batched snapshot patches on debounce/manual save.

## B. Shared internal project model

Use one `MobileWorkingProject` shape for render/edit regardless of source.

**Load adapters**
- `fromLocalPackage(...)`
- `fromCloudSnapshot(...)`

**Persistence adapters**
- `saveLocalWorkingCopy(...)`
- `pushCloudSnapshot(...)`

This keeps UI logic single-path and prevents duplicate feature drift.

## C. Cloud cache model

For each opened cloud project, persist:

- `cloudProjectId`
- `snapshotId` (or version token / updatedAt)
- normalized `MobileWorkingProject`
- `lastRefreshedAt`
- pending local edits queue/merge map

Open behavior:
- open cached immediately,
- then perform cheap head/version check,
- pull full snapshot only if changed.

## D. Asset strategy (practical)

1. Extend mobile snapshot representation (internal first, contract later) to carry:
   - `cloudAssetId` (when available)
   - optional `thumbUrl`
   - optional `thumbExpiresAt`
2. Render with:
   - cached URL if still valid,
   - else lazy fetch signed view for visible shots only,
   - cache signed views with TTL.
3. Do not prefetch all storyboard images.

## E. Refresh/sync strategy

- Default: manual refresh + on-open check.
- Optional throttle: interval head check while app/tab active (60–120s).
- Uploads: keep existing 6s debounce but only write when local dirty state exists.
- Conflict policy: keep last-write-wins on mobile for simplicity in Phase 1/2.

---

## Phased implementation plan

## Phase 1 — smallest viable (safe)

1. Introduce mobile cloud cache entity in `mobileLibrary` (separate from local imports).
2. Add cloud open pipeline:
   - fetch project list,
   - fetch snapshot head/latest id,
   - fetch full snapshot once,
   - normalize into working copy and persist.
3. Add explicit “Refresh from cloud” button.
4. Keep current cloud write debounce path; ensure writes source from cached working copy.
5. Fix cloud/local state reference bugs in `CloudModePane` so cloud rendering never depends on local-mode variables.

## Phase 2 — better refresh + assets

1. Add metadata-first refresh checks (head/version token).
2. Add lazy signed-view image resolver for visible storyboard shots.
3. Add signed URL cache + expiry handling in mobile.
4. Add stale badge + last refresh timestamp in UI.

## Phase 3 — optional nicer sync behavior

1. Optional background throttled head checks while foreground active.
2. Optional per-day incremental fetch if backend provides day manifests.
3. Optional queued outbound patch payloads (limited mobile updates) before full snapshot commits.

---

## Exact files/modules involved

### Mobile mode, routing, and cloud path
- `mobile/src/App.tsx`
- `mobile/src/auth.tsx`
- `mobile/src/storage/mobileLibrary.ts`
- `mobile/src/cloudPayloadToMobileSnapshot.ts`
- `mobile/src/mobileEdits.ts`
- `mobile/src/screens/ProjectHubScreen.tsx`
- `mobile/src/importers/mobilePackageImport.ts`

### Shared mobile contracts
- `shared/src/contracts/mobileContracts.ts`
- `shared/src/schemas/mobileContracts.ts`

### Desktop/cloud reference architecture
- `src/store.js`
- `src/components/CloudSyncCoordinator.jsx`
- `src/services/mobile/mobileExportService.js`
- `src/utils/assetSignedViewCache.js`
- `src/services/assetService.ts`

### Backend cloud/snapshot/assets
- `convex/projects.ts`
- `convex/projectSnapshots.ts`
- `convex/assets.ts`

---

## Shared vs mobile-specific boundaries

## Share (local + cloud)
- project/day/shot normalized working shape
- shot edit merge/apply logic
- render components (tabs/cards/modals)
- export of mobile snapshot from working copy

## Mobile-specific
- file picker import path
- cloud login gate UX
- localStorage cache persistence policy
- refresh triggers and lightweight foreground intervals
- viewport-based storyboard image prefetch behavior

---

## Risk matrix to test carefully

1. **Auth/session drift**
   - signed-in Clerk UI but Convex unauthenticated bootstrap race.

2. **Expired signed asset URLs**
   - stale URL rendered from cached snapshot without re-sign fallback.

3. **Cache invalidation mismatch**
   - stale local cloud cache opened when newer snapshot exists.

4. **State duplication**
   - local mode and cloud mode carrying separate project models that diverge.

5. **Conflict handling**
   - delayed sync overwriting newer cloud edit if snapshot lineage checks are missing.

6. **Entitlement transitions**
   - account loses paid access mid-session while cloud project is open.

---

## Recommended product UX copy (minimal)

- Mode picker copy:
  - **Local File Mode**: “Open a package file stored on this device.”
  - **Cloud Project Mode**: “Sign in to open projects from your ShotScribe cloud account.”
- Cloud header status:
  - “Opened from cloud · cached on device.”
  - “Last refreshed: <time>”
  - Button: “Refresh from cloud”

This keeps mode intent explicit and aligns with local-first + premium cloud overlay strategy.
