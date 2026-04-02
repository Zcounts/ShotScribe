# CI install fix: `tinyglobby@0.2.15` Linux failure

## Summary
GitHub Actions installs were failing on Linux during `npm ci` with:

- `Unsupported platform for tinyglobby@0.2.15: wanted {"os":"darwin"} (current: {"os":"linux"})`

The issue was not in application code; it was in the root lockfile metadata used by CI.

## Root cause
The root `package-lock.json` contained an invalid/corrupted entry for `node_modules/tinyglobby` that marked it as:

- `"optional": true`
- `"os": ["darwin"]`

That Darwin-only constraint caused Linux CI runners (`ubuntu-latest`) to fail during `npm ci` before any deploy/build command could run.

`tinyglobby` is **not** a direct dependency in `package.json`. It is a transitive dependency (from Vite/Rollup toolchain).

## Files changed
- `package-lock.json`
- `docs/ci-install-fix.md`

## What changed
1. Regenerated the root lockfile from `package.json` only (conservative dependency graph refresh, no manual dependency additions/removals).
2. Removed the bad lockfile metadata path that forced `tinyglobby` to Darwin-only.
3. Kept existing app/backend source code behavior unchanged (including the S3 credential fix in `convex/storage/s3.ts`).

## Why Linux CI was failing
`npm ci` strictly honors `package-lock.json`. Because lockfile metadata incorrectly declared `tinyglobby` as Darwin-only, npm rejected install on Linux with `EBADPLATFORM`.

## How to verify the fix
From repo root:

1. `npm ci`
2. `npx convex --version` (sanity check Convex CLI is installed)
3. `npm run build:web` (same build path used in production web artifact workflow)

For GitHub Actions:

- Re-run **Convex Production Deploy** workflow.
- Re-run **Production Web Build Artifact** workflow.

Both should now pass dependency installation on `ubuntu-latest`.
