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

## Local-only image invariant (June 2026)

Local/offline projects must not use the cloud image workflow. The shared guard is `isCloudImageWorkflowEnabled(projectRef, cloudAccessPolicy)`, and it only returns true for cloud project refs with cloud image access and edit entitlement. Local projects therefore must not call:

- `assets:createAssetUploadIntent`
- `assets:finalizeAssetUpload`
- `assets:assignShotLibraryAsset`
- `assets:getAssetSignedView` / `assets:getAssetSignedViewsBatch`
- S3 PUT/GET paths
- cloud image library write paths

### Local image storage model

For local desktop projects with a supported desktop bridge, ShotScribe writes normalized WEBP images into the project asset folder beside the `.shotlist` file:

- Project file: `/path/My Film.shotlist`
- Asset folder: `/path/My Film.assets/`
- Shot file names: `shot-{shotId}-{hash}.webp`
- Hero file names: `hero-{hash}.webp`
- Project references: `shotscribe-asset://{fileName}`

The saved image asset shape keeps machine-independent relative metadata and clears cloud state:

```js
imageAsset: {
  version: 1,
  mime: 'image/webp',
  thumb: 'shotscribe-asset://shot-123-abc.webp',
  full: null,
  meta: {
    sourceName,
    sourceBytes,
    localFileName,
    localRelativePath
  },
  cloud: null
}
```

Browser-only local mode, or desktop builds without the local asset bridge, fall back to embedded local data URLs so local/offline users still never request cloud upload intents or write cloud asset records.

### Migration for old local files with cloud image references

When opening a local project, ShotScribe scans shot and hero image fields for `https://` image refs, `imageAsset.cloud.assetId`, or cloud object keys. If found, the user is prompted:

> This project references cloud-hosted images. To use it fully offline, ShotScribe needs to copy those images into a local assets folder.

Options are **Copy images locally** (OK) or **Skip for now** (Cancel). Copy mode deduplicates repeated URLs or asset IDs, downloads/copies reachable images into the local asset folder, rewrites references to `shotscribe-asset://...`, sets `imageAsset.cloud = null`, and preserves original cloud URL/asset ID in migration metadata. If an asset ID has no accessible URL and cannot be resolved through signed-in cloud access, the project still opens with a recoverable “Cloud image not downloaded” placeholder.

### Required local/offline QA

1. Local desktop project: add storyboard image, save, close, reopen, image still works, no Convex/S3 calls.
2. Local desktop project: add hero image, save, close, reopen, image still works, no Convex/S3 calls.
3. Browser local project: add image, verify no cloud calls and project remains saveable.
4. Cloud project: add image, verify it still uploads to S3 and assigns a library asset.
5. Open old local file with `https://` image refs: choose copy, verify images download into the local asset folder and references are rewritten.
6. Open old local file with cloud asset IDs but no accessible URL: verify the app opens without crashing and shows recoverable placeholders.
7. Open a project with duplicate cloud image references: verify migration downloads one local copy and reuses the local reference.
8. Save migrated project, reopen with internet disabled, verify migrated images render locally.

### Desktop asset-folder verification

Use this direct manual verification when validating local desktop builds:

1. Save a local project as `Test.shotlist`.
2. Add a storyboard image to any shot.
3. Confirm `Test.assets/` appears beside `Test.shotlist`.
4. Confirm a `.webp` file exists inside `Test.assets/`.
5. Save the project and confirm `Test.shotlist` contains `shotscribe-asset://shot-` for the new image.
6. Confirm that new image entry in `Test.shotlist` has `cloud: null`.
7. Confirm the new image entry does not contain `https://` or `data:image`.
8. Reopen the project with internet disabled and verify the image renders.

In dev builds, the image upload debug payload should report `imageStorageMode: 'local-filesystem'` for this workflow. It should report `browser-data-url-fallback` only in browser mode without the desktop bridge, and `cloud` only for cloud projects.

## Browser local project folders (File System Access API)

For the hosted app at `app.shot-scribe.com`, the preferred local-only workflow is folder-based rather than loose `.shotlist` import/export:

- **Create Local Project Folder** asks Chrome/Edge for a folder with `showDirectoryPicker()`, creates `{Project_Name}.shotlist`, and creates `{Project_Name}.assets/` inside that same folder.
- **Open Local Project Folder** asks for a folder, scans for `.shotlist` files, asks which one to open when there are multiple, and uses the matching `{Project_Name}.assets/` folder for all local image reads/writes.
- **Import .shotlist File** remains a compatibility path. In browser mode, ShotScribe prompts users to choose a Local Project Folder if they want folder-backed local images.

Browser folder projects store newly added storyboard and hero images as normalized WEBP files in the assets folder and save only `shotscribe-asset://...` references with `cloud: null`. They must not silently embed new image data or upload to Convex/S3.

If the File System Access API is unavailable or folder permission is denied, ShotScribe asks before using the explicit embedded-image fallback. The debug storage modes are:

- `browser-file-system-access`
- `browser-embedded-data-url-fallback`
- `desktop-local-filesystem`
- `cloud`

### Browser folder QA checklist

1. Open `app.shot-scribe.com` in Chrome or Edge.
2. Click **Create Local Project Folder**.
3. Choose/create a folder and create `Test.shotlist`.
4. Add a storyboard image.
5. Confirm `Test.assets/` appears in the folder.
6. Confirm a `.webp` file appears inside `Test.assets/`.
7. Save.
8. Open `Test.shotlist` in a text editor.
9. Confirm it contains `shotscribe-asset://` for the new image.
10. Confirm the newly added image does not appear as `https://`.
11. Confirm the newly added image does not appear as `data:image`.
12. Disconnect internet.
13. Reopen via **Open Local Project Folder**.
14. Confirm the image still renders.

### Browser folder migration QA

1. Open a local project folder containing an old `.shotlist` with cloud/Convex/S3 image references.
2. Confirm the **Copy cloud images locally?** prompt appears.
3. Choose **Copy Images Locally**.
4. Confirm reachable images are downloaded into `{Project_Name}.assets/`.
5. Confirm project refs are rewritten to `shotscribe-asset://...`.
6. Confirm migrated local image assets have `cloud: null`.
7. Save and reopen offline.
8. Confirm images render.

### Skip migration QA

1. Open an old local project folder with cloud refs.
2. Choose **Skip for Now**.
3. Confirm the project opens without crashing.
4. Confirm no cloud upload occurs.
5. Use **Move Images to Local Assets Folder** from the save/menu actions later to retry migration or extraction.

### Embedded image extraction for old local files

Older local `.shotlist` files may contain images directly as `data:image/...` strings with `cloud: null`. When those files are opened or imported into a Local Project Folder, ShotScribe scans hero and storyboard image fields for embedded data URLs and prompts **Extract embedded images?**.

If the user chooses **Extract Images**, ShotScribe writes those images into `{Project_Name}.assets/`, rewrites the project to `shotscribe-asset://...`, preserves `cloud: null`, adds metadata such as `extractedFromEmbeddedDataUrl` and `originalEmbeddedMime`, and immediately saves the updated `.shotlist` back to the folder. The **Move Images to Local Assets Folder** action handles both embedded images and cloud/remote references.

Embedded `data:image/...` values are only allowed to remain when the user chooses **Keep Embedded For Now** or explicitly accepts the embedded-image fallback outside folder-backed mode.
