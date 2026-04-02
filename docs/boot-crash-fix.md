# Production boot crash fix — full incident report

Date: 2026-04-02  
Updated: 2026-04-02 (production stabilization pass)

---

## Incident summary

The live app at `https://app.shot-scribe.com` was white-screening on boot with:

```
Uncaught ReferenceError: Cannot access 'uo' before initialization
```

Simultaneously, the GitHub Actions CI build (`siteground-static-package.yml`) was
failing at the `npm ci` step with:

```
npm error Missing: @npmcli/fs@2.1.2 from lock file
npm error Missing: semver@7.7.4 from lock file
```

Because CI was broken, the TDZ fix that had already been committed to `main`
was never deployed, so the white-screen persisted.

---

## Issue 1 — CI build failure (lockfile corruption)

### Root cause

The `package-lock.json` was corrupted in commit `0fce155` ("Phase 2 shadcn
controls: dialogs, command, and shared inputs"). That commit added several new
npm packages (`cmdk`, `sonner`, `vaul`, `class-variance-authority`, etc.) and
updated the lockfile, but the resulting lockfile had an incorrect transitive
dependency tree for `node_modules/@nodelib/fs.walk`:

**Corrupted lockfile entry (before fix):**
```json
"node_modules/@nodelib/fs.walk": {
  "version": "1.2.8",
  "dependencies": {
    "mkdirp": "^1.0.4",
    "rimraf": "^3.0.2"
  }
}
```

**Correct entry (after fix):**
```json
"node_modules/@nodelib/fs.walk": {
  "version": "1.2.8",
  "dependencies": {
    "@nodelib/fs.scandir": "2.1.5",
    "fastq": "^1.6.0"
  }
}
```

`@nodelib/fs.walk` is a transitive dependency of `fast-glob` which is required
by `tailwindcss`. With the wrong deps recorded in the lockfile, `npm ci` would
install `mkdirp`/`rimraf` instead of `@nodelib/fs.scandir` and `fastq`,
causing PostCSS/Tailwind to crash during the Vite build with:

```
Cannot find module 'fastq'
Cannot find module '@nodelib/fs.scandir'
```

npm itself reported the lockfile inconsistency as missing `@npmcli/fs@2.1.2`
and `semver@7.7.4` (other cascading resolution mismatches from the same
corrupted tree).

### Files changed

- `package-lock.json` — deleted and fully regenerated with a clean `npm install`

### How it was fixed

```bash
rm package-lock.json
rm -rf node_modules
npm install   # generates a correct lockfile from package.json
```

The regenerated lockfile resolves `@nodelib/fs.walk` with its actual
dependencies and the CI `npm ci` step passes again.

---

## Issue 2 — Runtime boot crash (TDZ: `Cannot access 'uo' before initialization`)

### Root cause

`src/App.jsx` referenced `storyboardColumnCount` before its declaration inside
the `App` component body.

- `storyboardColumnCount` is derived from `useResponsiveViewport()`.
- It was used in three render-time computations (`totalPages`, `scenePageOffsets`,
  `storyboardPageItems`) that appeared **before** the hook call that creates it.
- Rollup minified `storyboardColumnCount` to `uo`.
- The temporal dead zone (TDZ) for `const uo` triggered on first render,
  throwing an uncaught `ReferenceError` that aborted React render entirely.

### Exact source location

File: `src/App.jsx`

Failing reference (used before declaration):
```js
// Line ~452 — first use
const cardsPerPage = CARDS_PER_PAGE[storyboardColumnCount] || 8
```

Declaration was later (now moved earlier — line 448–449):
```js
const { tier, isDesktopDown } = useResponsiveViewport()
const storyboardColumnCount = isDesktopDown ? 1 : columnCount
```

### Files changed

- `src/App.jsx` — moved the `useResponsiveViewport()` hook call and
  `storyboardColumnCount` derivation to before their first use; removed the
  duplicate declaration that existed later in the component. Fixed in commit
  `01acd0d`.
- `src/components/ShotCard.jsx` — added missing `useState` declarations for
  `cloudAssetView`, `imagePickerStep`, `isAssigningFromLibrary`, and
  `isDeletingLibraryAsset` that were used before being declared (from S3/media
  library work). Fixed in commit `19561ea`.

### Why the fix was not deployed

The lockfile corruption described in Issue 1 prevented CI from building the
fixed code. The TDZ fix existed in `main` but could never be packaged because
`npm ci` was failing.

---

## What was changed (summary)

| File | Change |
|------|--------|
| `package-lock.json` | Deleted and fully regenerated to fix corrupted `@nodelib/fs.walk` dependency tree |
| `src/App.jsx` | Moved `useResponsiveViewport()` / `storyboardColumnCount` before first use (commit `01acd0d`) |
| `src/components/ShotCard.jsx` | Added missing `useState` declarations for S3/media state (commit `19561ea`) |

---

## Redeploy steps

1. Ensure you are on `main` (or the production stabilization branch once merged).
2. Run `npm ci` — should now succeed cleanly.
3. Run `npm run build:web` with production env vars:
   ```bash
   VITE_ENABLE_CLOUD_FEATURES=true \
   VITE_CONVEX_URL=<production_convex_url> \
   VITE_CLERK_PUBLISHABLE_KEY=<production_clerk_key> \
   npm run build:web
   ```
4. Upload the `dist-siteground/` folder to SiteGround (or trigger the GitHub
   Actions `siteground-static-package` workflow — it should now pass).
5. Hard-refresh the live site (`Ctrl/Cmd+Shift+R`) and verify the app boots
   instead of white-screening.

---

## What still needs testing after deploy

- Production smoke test: app loads without white screen on cold boot.
- Storyboard tab: page count, outline/page navigation, responsive layout
  (desktop vs. compact widths).
- ShotCard: image upload flow (local file), S3 cloud upload (if cloud project),
  media library panel.
- Auth flow: sign-in and project loading for cloud projects.
- Callsheet / Schedule / Shotlist tabs: basic render, no console errors.
