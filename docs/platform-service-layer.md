# Platform service layer (desktop-first abstraction)

This phase introduces a single renderer-side abstraction in `src/services/platformService.js`.

## Why this exists

The React renderer should not call `window.electronAPI` directly from many components/stores.
Instead, renderer code now routes desktop/native operations through one service boundary.

## Current platform capabilities

`platformService` exposes:

- Project file flows: `saveProject`, `saveProjectSilent`, `openProject`, `openProjectFromPath`
- Export/file flows: `printToPDF`, `savePDF`, `savePNG`, `saveJson`
- OS integration: `openExternal`, `revealFile`, `copyText`
- Environment checks: `isDesktop`, `hasPrintToPDF`

## Desktop behavior

When running in Electron, calls delegate to preload bridge methods on `window.electronAPI`.
Existing desktop behavior and IPC contracts are unchanged.

## Browser behavior and guardrails

For browser/web execution, desktop-only calls fail safely with structured `{ success: false, error }` results instead of crashes.
Where practical, browser-safe fallbacks are used:

- Save project/json: download via blob URL.
- Open project: file picker + FileReader.
- Open external links: `window.open` fallback.
- Clipboard: `navigator.clipboard.writeText` fallback when available.

## Remaining web blockers (next phases)

These are still desktop-only and will need web implementations:

1. Silent overwrite save to existing absolute file paths (`saveProjectSilent`).
2. Open recent project by absolute filesystem path (`openProjectFromPath`).
3. Reveal exported file in OS file manager (`revealFile`).
4. Chromium `printToPDF` parity for deterministic PDF output and save dialogs.
5. Main-process temp-file print pipeline (`dialog:print-to-pdf`) is Electron-specific.

