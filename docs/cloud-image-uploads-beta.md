# Cloud Image Uploads (Public Beta)

Date: 2026-04-01

## Scope

- Cloud uploads in this phase are **images only**.
- No video uploads.
- No asset version history.
- Storage is optimized for working/reference usage, not archival originals.

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

- Upload pipeline normalizes incoming cloud images to 640x360 WEBP before completion metadata is accepted.
- Asset references are stored on project shot image asset records using project-scoped cloud asset ids.
- Asset fetch path requires both:
  - project membership authorization, and
  - paid cloud entitlement for the requesting user.

## Manual QA checklist

1. **Upload as paid owner**
   - Confirm owner with active paid entitlement can upload JPG/PNG/WEBP <= 15MB.
   - Confirm resulting cloud image renders in storyboard shot.
   - Confirm stored metadata reports 640x360 normalized dimensions.

2. **View as paid collaborator**
   - Confirm paid collaborator with active membership can open shared project.
   - Confirm collaborator can fetch/render cloud-hosted image assets.

3. **Blocked access as inactive/read-only user**
   - Use account with inactive/read-only billing state and project membership.
   - Confirm project data can be viewed.
   - Confirm cloud image fetch is blocked by asset access policy.

4. **Local-only user unaffected**
   - In local-only project mode, confirm existing storyboard image upload/edit behavior still works.
   - Confirm local image workflow does not require cloud entitlement.
