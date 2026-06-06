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

## Desktop local asset bridge

The bundled Electron bridge lives in `desktop/main.cjs`, `desktop/preload.cjs`, and `desktop/localAssets.cjs`. Any alternate desktop host must expose the same `window.electronAPI` methods used by `platformService`:

- `ensureProjectAssetFolder(projectFilePath)` creates/returns the sibling `{Project Name}.assets/` folder next to the `.shotlist` file.
- `writeLocalAsset(projectFilePath, fileName, arrayBufferOrBase64)` writes image bytes into that folder and returns `{ success, fileName, relativePath }`.
- `readLocalAsset(projectFilePath, relativePath)` reads a relative asset path and returns a `dataUrl` for renderer display.
- `downloadUrlToLocalAsset(projectFilePath, url, suggestedFileName)` downloads an old cloud URL into the sibling asset folder for local migration.
- `revealProjectAssetsFolder(projectFilePath)` opens the sibling asset folder in the OS file manager.

For a saved desktop project, renderer local-image upload must fail visibly if the bridge cannot write into the sibling asset folder. Embedded `data:image/...` fallback is only acceptable in true browser mode without an Electron bridge.

## Hosted browser local folder mode

In hosted browser mode, `platformService` now prefers the File System Access API for local projects:

- `createLocalProjectFolder(projectName, data)` uses `window.showDirectoryPicker()` to create a `.shotlist` file and a sibling `.assets/` directory.
- `openLocalProjectFolder()` uses `window.showDirectoryPicker()` to select a folder and scan for `.shotlist` files.
- `saveProjectSilent()` writes directly back to the selected folder project when the path is a `browser-fsa:` project path.
- Local asset APIs write/read files from the active folder project's `{Project_Name}.assets/` directory.
- Folder/file handles are stored in IndexedDB when the browser supports persistent `FileSystemHandle` storage.

Loose `.shotlist` file import remains available for compatibility, but it is no longer the recommended browser-local workflow because it cannot grant permission to create or maintain a sibling `.assets/` folder.
