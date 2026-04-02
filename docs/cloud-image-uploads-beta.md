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

- Convex remains the metadata source of truth (`projectAssets`).
- Browser upload flow for cloud projects:
  1. Request upload intent from Convex.
  2. Convex validates auth/access + billing entitlements and returns presigned **private S3 PUT** URL.
  3. Browser uploads normalized image bytes directly to S3.
  4. Browser finalizes asset metadata in Convex.
- Browser read flow for cloud projects:
  1. Browser asks Convex for asset view.
  2. Convex validates access and returns short-lived **signed S3 GET** URL for S3-backed assets.
- No public bucket/object URLs are used for cloud storyboard images.

- Upload pipeline normalizes incoming cloud images to 640x360 WEBP before completion metadata is accepted.
- Asset references are stored on project shot image asset records using project-scoped cloud asset ids.
- Asset fetch path requires both:
  - project membership authorization, and
  - paid cloud entitlement for the requesting user.

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

5. **Private bucket verification**
   - Confirm direct unsigned object URL returns access denied.
   - Confirm app-rendered images load through signed URLs only.

For rollout sequencing and incident response, also use:
- `docs/public-beta-launch-checklist.md`
- `docs/public-beta-rollback-checklist.md`
