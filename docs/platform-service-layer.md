# Platform service layer (web-first with optional desktop bridge)

`src/services/platformService.js` is the single renderer-side platform boundary.

## Why this exists

UI/state code should not call `window.electronAPI` directly.

`platformService` centralizes environment differences so browser behavior stays stable while still tolerating optional desktop bridge APIs when present.

## Current priority

- Primary target: static browser deployment.
- Persistence target: local browser storage + import/export files.
- Desktop bridge path: optional compatibility only (`window.electronAPI` if injected).

## Current capabilities

`platformService` exposes:

- Project file flows: `saveProject`, `saveProjectSilent`, `openProject`, `openProjectFromPath`
- Export/file flows: `printToPDF`, `savePDF`, `savePNG`, `saveJson`
- OS integration: `openExternal`, `revealFile`, `copyText`
- Environment checks: `isDesktop`, `hasPrintToPDF`
- Browser local persistence helpers: autosave/recent projects/local snapshots

## Browser behavior

In browser mode, desktop-only APIs fail safely with structured `{ success: false, error }` responses.

Browser-safe fallbacks are implemented for key flows:

- Save project/json → file download via Blob URL.
- Open project → `<input type="file">` + `FileReader`.
- Open external URLs → `window.open`.
- Copy text → `navigator.clipboard.writeText` when available.
- Autosave/recent project metadata → localStorage.

## Optional desktop bridge behavior

When `window.electronAPI` is present, methods delegate to bridge APIs. If absent, browser-safe behavior remains the default.

## Out of scope for this phase

- Backend/cloud persistence
- Account/auth features
- Hosted publishing pipelines
