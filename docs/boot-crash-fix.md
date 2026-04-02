# Production boot crash fix (ReferenceError: Cannot access 'uo' before initialization)

Date: 2026-04-02

## Exact root cause
`src/App.jsx` used `storyboardColumnCount` before it was initialized.

- `storyboardColumnCount` is derived from `useResponsiveViewport()`.
- It was referenced earlier in render-time calculations (`totalPages`, `scenePageOffsets`, `storyboardPageItems`) before the declaration existed later in the component body.
- In production minified output this variable became `uo`, producing:
  - `Uncaught ReferenceError: Cannot access 'uo' before initialization`

## Exact file(s) changed
- `src/App.jsx`

## Exact source code area that caused the crash
- The first failing use was the `totalPages` calculation:
  - `const cardsPerPage = CARDS_PER_PAGE[storyboardColumnCount] || 8`
- But `storyboardColumnCount` was declared much later in the component.

## Why this caused a production boot failure
The error occurs during initial component evaluation of the default app route (`App`), before the page can render. A top-level render-time TDZ (`let/const` temporal dead zone) exception aborts React render, resulting in a blank screen.

## What was changed to fix it
- Moved:
  - `const { tier, isDesktopDown } = useResponsiveViewport()`
  - `const storyboardColumnCount = isDesktopDown ? 1 : columnCount`
- to an earlier location before any usage of `storyboardColumnCount`.
- Removed the later duplicate declaration site.

This is a minimal ordering fix only; no feature behavior or S3/media logic was changed.

## What still needs testing
- Production smoke test on default route load (no white screen).
- Storyboard tab page counts + outline/page navigation behavior on desktop vs compact widths.
- Drag/reorder and shot-card render path under the current production build.
