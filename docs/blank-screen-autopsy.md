# Blank Screen Autopsy (app.shot-scribe.com)

Date: 2026-04-02

## Likely root cause
A recent storyboard/media-library merge introduced new UI state usage in `ShotCard` (`imagePickerStep`, `isAssigningFromLibrary`, `isDeletingLibraryAsset`, and `setCloudAssetView`) without declaring the corresponding React `useState` hooks.

Because `ShotCard` is rendered on the default storyboard route, this causes a runtime `ReferenceError` during render/app startup, which can present as a full white screen in production.

## Exact files involved
- `src/components/ShotCard.jsx`

## What was changed to restore app boot
- Added missing `useState` declarations for:
  - `cloudAssetView` / `setCloudAssetView`
  - `imagePickerStep` / `setImagePickerStep`
  - `isAssigningFromLibrary` / `setIsAssigningFromLibrary`
  - `isDeletingLibraryAsset` / `setIsDeletingLibraryAsset`
- Kept the private S3/signed-view flow intact.
- Wired `storyboardImageSrc` to prefer `prefetchedCloudAssetView`, then `cloudAssetView`, then existing shot-local fallback fields.

## What is still pending
- Confirm production logs for the exact runtime exception signature from the failing build to close the incident with hard evidence.
- Add a lightweight runtime smoke check (or CI lint/type coverage) that catches undeclared state references in critical render paths before deploy.

## How to verify the fix
1. Build the web app (`npm run build`) and confirm successful production bundle output.
2. Run locally (`npm run dev:web`) and load the default app route.
3. Open Storyboard/Shot cards and verify:
   - app no longer whitescreens,
   - Add Image menu opens,
   - library and upload actions render without immediate runtime errors.
4. In production/staging, hard-refresh (`Cmd/Ctrl+Shift+R`) and validate the app shell and default route paint successfully.
