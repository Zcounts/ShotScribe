# ShotScribe Image Storage Autopsy and Plan

## 1. Executive Summary
- The current production code does **not** use AWS S3 directly for image upload/download.
- Current cloud image flow is implemented with **Convex File Storage** (`ctx.storage.generateUploadUrl`, `ctx.storage.getUrl`, `ctx.storage.delete`) and a `projectAssets` metadata table in Convex.
- The frontend already has a working split between:
  - local projects: inline/base64-style image payloads,
  - cloud projects: uploaded image blobs + Convex metadata (`shot.imageAsset.cloud.assetId`).
- The biggest architecture gap versus your desired end-state is: **S3 is not wired into app code today**. Any S3 bucket currently in AWS appears external/parallel to the app path.
- Recommended direction for ShotScribe: adopt **browser -> S3 (presigned PUT/POST) -> Convex metadata finalize** with a thin storage service layer in Convex actions. This gives minimal S3 traffic, keeps Convex as system of record for metadata, and avoids routing binary through Convex or app servers.

---

## 2. Current State in the Repo

### 2.1 Frontend upload + preview behavior

#### Upload entry point
- `src/components/ShotCard.jsx`
  - `handleImageChange` handles file selection and branches by project type.
  - Cloud project path calls:
    - `processStoryboardUploadForCloud` (normalizes to 640x360 WEBP),
    - `uploadStoryboardAssetToCloud` (service),
    - then updates store via `updateShotImage`.
  - Local project path calls `processStoryboardUpload` and stores inline image payloads in project state.

#### Image processing pipeline
- `src/utils/storyboardImagePipeline.js`
  - `processStoryboardUpload(file, ...)`: creates thumbnail/full WEBP data URLs for local storage.
  - `processStoryboardUploadForCloud(file, ...)`: creates normalized WEBP blob(s), currently same blob for thumb/full.

#### Cloud upload service used by UI
- `src/services/assetService.ts`
  - `uploadBlobToConvex(uploadUrl, blob)`: POSTs binary to Convex storage upload URL.
  - `uploadStoryboardAssetToCloud(...)`:
    - obtains upload URL from Convex mutation,
    - uploads thumb blob to Convex storage,
    - sets `fullStorageId = thumbStorageId` (currently duplicate pointer, no distinct full image object),
    - calls `completeAssetUpload` mutation,
    - returns shaped payload for `shot.image` and `shot.imageAsset`.
  - `collectCloudAssetIdsFromProjectData(...)`: used for orphan pruning keep-list.

#### Preview resolution in UI
- `src/components/ShotCard.jsx`
  - Uses Convex query `assets:getAssetView` when `shot.imageAsset.cloud.assetId` exists.
  - Render priority: `cloudAssetView.thumbUrl` -> local cached `shot.imageAsset.thumb` -> `shot.image`.

### 2.2 Local state + persistence shape
- `src/store.js`
  - `updateShotImage`: normalizes incoming payload and stores:
    - `shot.image` (thumbnail URL/data),
    - `shot.imageAsset` object (`mime`, `thumb`, `meta`, optional `cloud`).
  - Project serialization (`getProjectData`) persists `imageAsset.cloud` ids into snapshot payload.
  - `loadProject` rehydrates image fields.

### 2.3 Convex schema/functions for media

#### Schema
- `convex/schema.ts`
  - `projectAssets` table fields:
    - `projectId`, `uploadedByUserId`, `shotId`, `kind`, `mime`, `sourceName`,
    - `thumbStorageId`, `fullStorageId`, `meta`,
    - `createdAt`, `updatedAt`, `deletedAt`.
  - Indices:
    - `by_project_id`,
    - `by_project_id_shot_id`.

#### Asset functions
- `convex/assets.ts`
  - `createAssetUploadUrl`: authz + feature flag + `ctx.storage.generateUploadUrl()`.
  - `completeAssetUpload`: validates mime/source/size/normalized dimensions, inserts `projectAssets`, returns `ctx.storage.getUrl(...)` for thumb/full.
  - `getAssetView`: authz + fetches asset + returns `ctx.storage.getUrl(...)` each query.
  - `pruneOrphanedAssets`: deletes orphaned Convex storage objects and soft-deletes metadata row.

#### Related save flow coupling
- `src/components/ScriptTab.jsx`
  - On manual cloud snapshot save: computes keep-list via `collectCloudAssetIdsFromProjectData`, then calls `assets:pruneOrphanedAssets`.

### 2.4 Access policy / entitlements impacting image access
- `convex/accessPolicy.ts`
  - `assertCanAccessCloudAssets`, `assertCanEditCloudProject`, etc. gate read/write.
- `src/components/ShotCard.jsx`
  - Blocks cloud upload/read when billing policy disallows cloud assets.

### 2.5 Environment/config observed
- Frontend runtime config:
  - `src/config/runtimeConfig.js`: `VITE_ENABLE_CLOUD_FEATURES`, `VITE_CONVEX_URL`, `VITE_CLERK_PUBLISHABLE_KEY`.
- Docs mention observability env vars and cloud setup but no S3 vars currently wired.
- Convex backend env usage exists for auth/ops/stripe in other files, but no S3-related env keys are used in code today.

### 2.6 AWS/S3 references in code
- No AWS SDK dependency usage found in app/Convex code paths.
- No direct S3 API calls found in frontend or Convex functions.
- No bucket/key/presign logic currently implemented in repo.

---

## 3. Current AWS / Convex Assumptions
- Code currently assumes **Convex Storage is authoritative binary store** for cloud images.
- Convex `projectAssets` assumes blob handles are `Id<'_storage'>` (Convex storage ids), not S3 keys.
- UI assumes it can ask Convex for a render URL (`assets:getAssetView`) and receive usable thumb/full URLs.
- Snapshot payload persists `assetId` references in shot data, and cleanup depends on that linkage.
- There is no in-repo logic for:
  - S3 credentials,
  - S3 key naming,
  - presigned upload generation,
  - signed GET URL strategy,
  - CloudFront/CDN layer.

---

## 4. Gaps and Risks

### 4.1 Architectural gap vs desired end-state
- Desired target says binary in S3 + metadata in Convex.
- Current implementation is binary in Convex Storage + metadata in Convex.
- Therefore migration is required; current infrastructure is not just “partially wired S3,” it is a different storage backend.

### 4.2 Traffic/cost risks in current pattern
- `assets:getAssetView` calls `ctx.storage.getUrl` per query, potentially frequent if many cards re-render.
- If URL TTL is short or query frequency high, this can add avoidable backend calls.
- Asset read model is card-level query (`ShotCard` per-shot) vs batched project-level asset map, which may increase query fan-out.

### 4.3 Data model inconsistencies
- Frontend upload service sets `fullStorageId = thumbStorageId`; metadata implies two variants but currently one object.
- `imageAsset.full` is persisted as `null` in multiple store paths; model supports full-size but runtime behavior mostly thumbnail-first.

### 4.4 Orphan management risks
- Orphan cleanup only runs on explicit manual snapshot save path (`ScriptTab` handler). If users leave/close before save, orphan files may remain.
- No evidence of scheduled reconciliation job for stale/unreferenced asset rows.

### 4.5 Security / exposure uncertainty
- Repo cannot confirm actual S3 bucket policy/CORS/ACL state; that lives in AWS account config, not code.
- If bucket is public-read (as your screenshot suggests), future private/presigned strategy must account for existing public URLs and cache invalidation.

### 4.6 Operational clarity gaps
- No storage abstraction module dedicated to “asset provider” (Convex Storage vs S3).
- Upload/read/delete logic is split across UI + asset service + Convex functions without a single provider contract.

---

## 5. Recommended Architecture

### 5.1 Recommended option
**Recommend pattern B (with a small hardening step):**
1. Browser requests presigned upload intent from Convex action.
2. Browser uploads binary directly to S3.
3. Browser calls Convex mutation to finalize metadata record.
4. UI reads image references from Convex query payloads.
5. Browser loads image asset directly from stable URL (CDN/public path) or short-lived signed GET only when needed.

This is best fit for ShotScribe because it:
- keeps Convex as metadata/authorization source,
- avoids binary transit through Convex/app servers,
- minimizes S3 calls to PUT + GET only,
- keeps frontend flow close to current implementation shape.

### 5.2 Why not A (browser -> Convex -> S3)
- Adds extra hop and compute overhead.
- Increases Convex/action execution load and latency.
- Harder to scale for larger media.

### 5.3 Possible C variant
- Browser -> S3 multipart (for larger future assets) + async processing pipeline (Lambda) for thumbnails.
- Good later if image/video sizes increase; not needed for Phase 1 storyboard stills.

### 5.4 Recommended upload flow (exact)
1. Client preprocesses image (keep existing normalization behavior initially).
2. Client calls `assets:createS3UploadIntent(projectId, shotId, mime, bytes, checksum?)`.
3. Convex action:
   - validates access/plan/write flag,
   - returns `{ objectKey, uploadUrl, requiredHeaders, expiresAt }`.
4. Client uploads to S3 with returned URL.
5. Client calls `assets:completeS3AssetUpload(...)` mutation with metadata and object key.
6. Mutation stores metadata row in Convex and links shot/project references.
7. UI updates local shot state immediately from mutation response.

### 5.5 Recommended read flow (exact)
1. UI loads shot/project data from Convex snapshots.
2. For assets, Convex returns stored metadata including **resolvable image URL fields** (or derived URL from key and known CDN base).
3. Browser requests actual image only when `<img src>` renders.
4. Avoid per-image HEAD/list calls.
5. Prefer batched asset view query by project (or include needed fields in snapshot payload) to avoid per-card query fan-out.

### 5.6 Public URL vs presigned GET
- **Phase 1 pragmatic recommendation:**
  - Keep bucket private if possible and serve through CloudFront signed/cached URLs **or** short-lived presigned GET from Convex when truly needed.
- **If simplicity is priority for beta:**
  - Use CloudFront/public read path on unguessable keys, but document tradeoff (public assets if URL leaked).
- Given production filmmaking content sensitivity, private bucket + controlled delivery is preferable long-term.

### 5.7 Caching strategy
- Set object `Cache-Control` on upload (e.g., immutable long max-age when key is content-versioned).
- Use content-hash or UUID-based object keys; never overwrite same key for changed file.
- Convex metadata should store canonical URL/key; browser cache handles repeat renders.

### 5.8 Orphan prevention strategy
- Keep current prune-on-save behavior initially.
- Add periodic reconciliation job (Convex scheduled job or ops script) to delete:
  - metadata rows marked deleted beyond retention window,
  - S3 objects with no active Convex reference.
- Use two-phase delete:
  - mark deleted in Convex first,
  - async delete in S3,
  - retry queue for failed deletions.

### 5.9 Thumbnails / transforms timing
- Phase 1: keep one normalized image variant only (already 640x360 pattern exists) for lowest risk.
- Phase 2+: optional multi-size generation (thumb + full + responsive) if needed for export/perf.

---

## 6. Proposed Data Model

### 6.1 Convex `projectAssets` target fields
Store in Convex per image:
- identity/linking
  - `projectId`
  - `shotId` (optional)
  - `uploadedByUserId`
  - `kind` (`storyboard_image`)
- object location
  - `provider` (`s3`)
  - `bucket` (or implicit via env; avoid if single bucket)
  - `objectKey`
  - `region` (optional)
- render fields
  - `primaryUrl` (optional cached derived URL)
  - `thumbKey` / `fullKey` (if multi-variant later)
- file metadata
  - `mime`
  - `fileSizeBytes`
  - `width`
  - `height`
  - `sourceName`
  - `sourceMime`
  - `sourceBytes`
- audit/lifecycle
  - `createdAt`, `updatedAt`, `deletedAt`
  - optional `etag` / checksum

### 6.2 Keep only in S3
- Raw image binary.
- Optional derived variants binaries.

### 6.3 Snapshot shot payload guidance
- Keep only lightweight reference:
  - `imageAsset.cloud.assetId`
  - optional fallback thumbnail URL for optimistic UI.
- Do not embed large base64 blobs in cloud snapshots.

---

## 7. Implementation Plan

## Phase 1 — Introduce S3-backed upload path (no broad rewrite)
- **Goal**
  - Replace Convex storage binary path with S3 direct upload while preserving existing UI behavior and Convex metadata ownership.
- **Files likely affected**
  - `convex/assets.ts`
  - `convex/schema.ts`
  - `src/services/assetService.ts`
  - `src/components/ShotCard.jsx`
  - optional new: `convex/storage/s3.ts` (small service helper)
- **Backend work**
  - Add action/mutation pair for upload intent + completion.
  - Validate mime/size/project access as now.
- **Frontend work**
  - Swap upload target from Convex upload URL to S3 presigned URL response.
  - Keep same `updateShotImage` contract so UI impact is low.
- **AWS work**
  - Ensure bucket CORS for browser PUT/POST from app/mobile origins.
  - Ensure IAM user/role permissions minimal to generate presigns (PutObject scoped prefix).
- **Convex work**
  - Store S3 object key + metadata.
  - Continue `assetId` references in snapshots.
- **Risks**
  - CORS misconfiguration blocks uploads.
  - URL/access model mismatch (public vs signed) breaks rendering.

## Phase 2 — Read-path optimization + batching
- **Goal**
  - Reduce per-shot Convex query overhead and avoid repeated URL generation.
- **Files likely affected**
  - `convex/assets.ts`
  - `src/components/ShotCard.jsx`
  - potentially `src/store.js`/cloud snapshot hydration helpers
- **Backend work**
  - Add `listAssetViewsForProject(projectId, assetIds[])` query or embed resolved URLs in a project-level payload.
- **Frontend work**
  - Replace per-card `getAssetView` queries with batched access.
- **AWS work**
  - Optional CloudFront config for cached image delivery.
- **Convex work**
  - Cache/derive URLs in metadata where safe.
- **Risks**
  - Stale URL caching if signed URL TTLs are short.

## Phase 3 — Lifecycle hardening and cleanup automation
- **Goal**
  - Prevent/repair orphaned files and improve reliability.
- **Files likely affected**
  - `convex/assets.ts`
  - new scheduled/ops task file under `convex/`
  - docs/runbooks
- **Backend work**
  - Add scheduled reconciliation and retry-safe delete workflow.
- **Frontend work**
  - Minimal (none required except improved status messaging).
- **AWS work**
  - Optional lifecycle rules for stale uploads in temporary prefix.
- **Convex work**
  - Track delete state transitions + failure logging.
- **Risks**
  - Over-deletion if reference checks are wrong (must be conservative).

## Phase 4 — Optional transforms and responsive variants
- **Goal**
  - Add thumbnails/multi-resolution only if metrics justify it.
- **Files likely affected**
  - image pipeline utilities + asset schema metadata + export paths
- **Backend work**
  - async transform pipeline (if introduced).
- **Frontend work**
  - `srcSet`/size-aware rendering.
- **AWS work**
  - Lambda/S3 event or image CDN transform config.
- **Convex work**
  - store variant keys and dimensions.
- **Risks**
  - operational complexity; defer until needed.

---

## 8. Config and Secrets

### 8.1 Likely required env vars/secrets (not currently wired)
- Convex/server-side:
  - `S3_REGION`
  - `S3_BUCKET`
  - `S3_UPLOAD_PREFIX` (e.g., `storyboard/`)
  - `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (or IAM role-based env in deployment)
  - optional `S3_PUBLIC_BASE_URL` or `CDN_BASE_URL`
  - optional `S3_SIGNED_GET_TTL_SECONDS`
- Frontend:
  - likely none required for direct credentials (should not expose AWS secrets).
  - optional `VITE_ASSET_BASE_URL` only if using fully public/static URL base.

### 8.2 Dashboard/settings
- Convex dashboard secrets for S3 credentials.
- AWS IAM policy scoped to required bucket/prefix actions:
  - `s3:PutObject`, `s3:AbortMultipartUpload`, `s3:GetObject`, `s3:DeleteObject` as needed.
- S3 bucket CORS policy allowing web + mobile origins and required headers.

---

## 9. Testing and Verification Plan

### 9.1 Upload correctness
- Upload valid JPG/PNG/WEBP under limit:
  - verify S3 object exists once,
  - verify Convex metadata row created,
  - verify shot renders image after reload.
- Upload unsupported type/oversized file:
  - verify user-facing error,
  - verify no metadata row and no stray object.

### 9.2 Read behavior / traffic
- Confirm app renders images using Convex metadata references.
- Inspect network:
  - no S3 list/head chatter during normal board navigation,
  - only GET image requests for rendered cards.

### 9.3 Permissions
- User without cloud entitlement:
  - cannot upload cloud assets,
  - cannot access restricted asset URLs.
- Shared project viewer/editor checks align with current access policy behavior.

### 9.4 Delete/orphan behavior
- Replace image on a shot and save snapshot:
  - old asset is pruned according to keep-list.
- Remove shot/image and save snapshot:
  - orphan cleanup marks/deletes old object.

### 9.5 Caching
- Verify response headers (`Cache-Control`, `Content-Type`) on S3/CloudFront objects.
- Confirm repeat render avoids re-download when browser cache valid.

### 9.6 Failure cases
- Simulate presign expiry before upload.
- Simulate upload success but completion mutation failure.
- Simulate completion success but local UI update failure/reload recovery.

---

## 10. Open Questions
- Should storyboard images be private-by-default (signed GET/CloudFront signed) or public-read during beta?
- Is the existing S3 bucket intended to remain public (current AWS screenshot indicates public-read policy), or can it be locked down?
- Should one normalized variant remain sufficient for launch, or do exports require true full-resolution originals?
- What retention policy is desired for soft-deleted assets?
- Do we need cross-project dedupe by checksum, or is per-upload unique object acceptable for now?
- Should mobile and desktop share identical upload endpoints immediately, or desktop first then mobile?
- Is there a required CDN domain under `shot-scribe.com` for asset delivery now or later?

---

## 11. Recommended Next Prompt

```text
Implement Phase 1 only from docs/image-storage-autopsy-plan.md.

Scope:
- Keep changes minimal and reversible.
- Replace Convex file-storage binary upload path with S3 direct upload via presigned URL.
- Keep Convex as metadata source of truth for projectAssets.
- Preserve existing UI behavior and shot.imageAsset.cloud.assetId contract.
- Do not redesign unrelated save/sync/auth flows.

Required tasks:
1) Add a small Convex-side S3 storage service module for presigned upload generation and object URL/key handling.
2) Update convex/assets.ts:
   - new upload-intent endpoint (auth + validation + presign)
   - completion endpoint persists S3 key metadata in projectAssets
   - read endpoint returns stable render URL from metadata/key
   - maintain existing access-policy checks.
3) Update schema minimally for S3 key/provider fields while keeping backwards compatibility.
4) Update src/services/assetService.ts and ShotCard upload path to use presigned S3 upload.
5) Keep existing prune flow behavior intact (do not redesign yet).
6) Add/update docs with required env vars, IAM policy, and S3 CORS JSON.
7) Add manual QA checklist covering upload/read/delete and entitlement failures.

Constraints:
- No broad rewrite.
- No TODO placeholders.
- Keep current cloud/local product behavior unchanged except storage backend wiring.
- Include migration handling for existing Convex storage-backed assets.
```
