# Cloud Image Uploads (Public Beta)

Date: 2026-04-01

## Scope

- Cloud uploads in this phase are **images only**.
- No video uploads.
- No asset version history.
- Storage is optimized for working/reference usage, not archival originals.
- Storyboard shot assignment remains **single-image** per shot.

## Phase 2 audit notes (single-image assumptions kept)

- Shot data still stores `shot.image` and `shot.imageAsset` for rendering and snapshot compatibility.
- Cloud assignment compatibility field remains `shot.imageAsset.cloud.assetId` so existing save/snapshot prune flow keeps working.
- Rendering still uses a single resolved image source per shot (signed cloud URL preferred, local fallback unchanged).

## Paid/cloud access rules

- Cloud image upload and retrieval are paid cloud-tier capabilities.
- Shared cloud projects require paid access for collaborators.
- If billing is inactive/read-only:
  - Users may still view cloud project data.
  - Users may **not** fetch cloud-hosted image assets.
  - Users may **not** upload/update cloud-hosted image assets.
- Local-only storyboard/reference image workflows remain unchanged and available for local-only users.

## Supported file types and size limits (beta)

### Source file acceptance (upload input)

- Allowed source MIME types:
  - `image/jpeg`
  - `image/png`
  - `image/webp`
- Source max size: **15 MB**.

### Stored cloud output

- Stored output MIME type: `image/webp`.
- Normalized storage output: **640 x 360**.
- Fit mode: **cover/cropped to frame**.
- Normalized output max size target: **4 MB**.
- Beta stores reduced working outputs only (no high-resolution archival original storage).

## Storage/reference behavior

- Convex remains the metadata source of truth (`projectAssets`).
- Project media library records are stored in `projectAssets` as project-level assets (not per-shot galleries).
- Shot-to-asset assignment is tracked separately in `shotAssetAssignments` and mirrored in shot payload compatibility fields (`shot.imageAsset.cloud.assetId`) for existing save/snapshot flows.
- Browser upload flow for cloud projects:
  1. Request upload intent from Convex.
  2. Convex validates auth/access + billing entitlements and returns presigned **private S3 PUT** URL.
  3. Browser uploads normalized image bytes directly to S3.
  4. Browser finalizes asset metadata in Convex as a library asset.
  5. Browser assigns the created asset to the current shot.
- Browser read flow for cloud projects:
  1. Browser asks Convex for asset view.
  2. Convex validates access and returns short-lived **signed S3 GET** URL for S3-backed assets.
- No public bucket/object URLs are used for cloud storyboard images.

- Upload pipeline normalizes incoming cloud images to 640x360 WEBP before completion metadata is accepted.
- Asset references are stored on project shot image asset records using project-scoped cloud asset ids.
- Asset fetch path requires both:
  - project membership authorization, and
  - paid cloud entitlement for the requesting user.

## Storyboard Add Image picker flow (Phase 3)

### User flow

1. User clicks **Add Image** on a storyboard shot card (cloud projects).
2. Picker opens with two options:
   - **Upload New**
   - **Choose from Library**
3. Upload New path:
   - user selects source file,
   - app normalizes to 640x360 WEBP,
   - uploads via private S3 presigned PUT,
   - finalizes in Convex as project library asset,
   - assigns that asset to the current shot.
4. Choose from Library path:
   - app shows project media library items,
   - user selects one item,
   - selected asset is assigned to the current shot.
5. Local-only projects keep the existing direct local upload behavior.

### Technical flow

- Upload New:
  - `assets:createAssetUploadIntent` -> browser PUT to S3 -> `assets:finalizeAssetUpload` -> `assets:assignShotLibraryAsset`.
- Choose from Library:
  - `assets:listProjectLibraryAssets` -> `assets:assignShotLibraryAsset`.
- Rendering remains stable:
  - selected cloud asset resolves through `assets:getAssetSignedView`,
  - local `shot.image` / `shot.imageAsset` fallback behavior remains intact.

## Library delete lifecycle (Phase 4)

### Distinction between unassign and delete

- **Remove from Shot** only unassigns that shot (`assets:unassignShotLibraryAsset`); asset remains in library.
- **Delete from Library** performs conservative soft-delete lifecycle and does not immediately hard-delete S3 bytes.

### Soft delete behavior

1. `assets:softDeleteLibraryAsset` checks whether asset is still referenced.
2. Safe rule for Phase 4: **block library deletion while referenced** (`blocked_referenced`) to avoid accidental media loss.
3. If unreferenced:
   - asset is marked `soft_deleted`,
   - hidden from normal library query,
   - `hardDeleteAfter` is set (`now + ASSET_DELETE_GRACE_HOURS`, default 24h),
   - delayed worker is scheduled via Convex scheduler.

### Undo behavior

- `assets:undoSoftDeleteLibraryAsset` restores a soft-deleted asset during the grace window by clearing `deletedAt`, `hardDeleteAfter`, and status back to `active`.

### Delayed hard delete behavior

1. Scheduled worker (`hardDeleteAssetWorker`) runs at/after due time.
2. Before hard delete it verifies:
   - asset is still `soft_deleted`,
   - retention window has elapsed,
   - no active references remain.
3. If still safe:
   - delete backing object (`DeleteObject` for S3 or Convex storage delete for legacy provider),
   - mark asset `hard_deleted`.
4. If unsafe/referenced: mark `blocked_referenced`.
5. If delete fails: mark `delete_failed` with error metadata.

### Failure/retry safety net

- Recurring Convex cron (`convex/crons.ts`) runs hourly and calls reconciliation action to retry due deletions.
- Reconciliation catches missed scheduler runs and transient failures by reprocessing due `soft_deleted` assets.

## Media library read performance optimization (Phase 5)

### What changed

- Storyboard shot rendering now uses a batched signed-view read path:
  - `assets:getAssetSignedViewsBatch` accepts a set of asset IDs for a grid/page,
  - returns signed/private URLs for those assets in one server roundtrip.
- `ShotGrid` now prefetches signed views once per visible shot set and passes them to each `ShotCard`.
- `ShotCard` no longer performs a per-shot signed-view fetch on mount/update.

### Why this is more efficient

- Reduces per-shot/per-image query fan-out for large storyboards.
- Keeps signed/private delivery semantics unchanged.
- Maintains simple browser loading:
  - Convex returns URL references,
  - browser only fetches image bytes for images actually rendered by `<img>`.

### QA for large project libraries

1. Open a storyboard scene with many shots that have cloud image assignments.
2. Verify image rendering remains correct and no auth regressions occur.
3. Compare network behavior before/after:
   - fewer Convex function calls for signed view resolution,
   - no per-shot signed-view waterfall.
4. Scroll and paginate storyboard pages; verify newly visible shots resolve correctly.
5. Confirm signed URL behavior still works after refresh and does not expose public bucket URLs.

## Convex environment variables required for private S3

- `S3_REGION` (example: `us-east-1`)
- `S3_BUCKET` (private bucket name)
- `S3_UPLOAD_PREFIX` (optional; defaults to `storyboard`)

## Required AWS IAM policy (example baseline)

Use least privilege and scope `Resource` to the exact bucket/prefix.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ShotScribeStoryboardAssets",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::YOUR_PRIVATE_BUCKET/storyboard/*"
    }
  ]
}
```

## Required S3 CORS JSON (example)

Set bucket CORS so browser PUT uploads from your app origins succeed.

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedOrigins": [
      "https://shot-scribe.com",
      "https://app.shot-scribe.com",
      "http://localhost:5173"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

## Manual QA checklist

1. **Upload as paid owner**
   - Click **Add Image** and verify picker shows **Upload New** and **Choose from Library**.
   - Confirm owner with active paid entitlement can upload JPG/PNG/WEBP <= 15MB.
   - Confirm resulting image appears in the project media library picker.
   - Confirm resulting cloud image renders in storyboard shot after auto-assign.
   - Confirm stored metadata reports 640x360 normalized dimensions.

2. **Choose from library**
   - Open shot image menu and choose **Choose from Library**.
   - Select a previously uploaded image.
   - Confirm no new upload occurs and selected shot image swaps to the chosen library asset.

3. **Remove from shot**
   - Use **Remove from Shot** in shot image menu.
   - Confirm shot image clears.
   - Confirm image remains available in project media library.

4. **Delete from library + undo**
   - Delete an unreferenced image from library.
   - Confirm it is hidden from normal library list immediately.
   - Confirm it appears under recently deleted and Undo restores it.

5. **Delete blocked for referenced assets**
   - Try deleting an asset currently assigned to a shot.
   - Confirm delete is blocked with safe messaging and asset remains available.

6. **View as paid collaborator**
   - Confirm paid collaborator with active membership can open shared project.
   - Confirm collaborator can fetch/render cloud-hosted image assets.

7. **Blocked access as inactive/read-only user**
   - Use account with inactive/read-only billing state and project membership.
   - Confirm project data can be viewed.
   - Confirm cloud image fetch is blocked by asset access policy.

8. **Local-only user unaffected**
   - In local-only project mode, confirm existing storyboard image upload/edit behavior still works.
   - Confirm local image workflow does not require cloud entitlement.

9. **Private bucket verification**
   - Confirm direct unsigned object URL returns access denied.
   - Confirm app-rendered images load through signed URLs only.

For rollout sequencing and incident response, also use:
- `docs/public-beta-launch-checklist.md`
- `docs/public-beta-rollback-checklist.md`
