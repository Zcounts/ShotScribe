# LumaLayout Phase 0 audit: desktop/runtime coupling and migration map

Date: 2026-04-08
Scope: renderer/web code in `src/` plus related docs.

## A. Desktop/runtime dependencies found

### 1) Single desktop bridge boundary (`window.electronAPI`)
- `src/services/platformService.js`
  - `getElectronApi()` reads `window.electronAPI` and is the only direct bridge lookup.
  - `isDesktop()` and `hasPrintToPDF()` are runtime checks based on bridge availability.
  - Desktop-delegated methods: `saveProject`, `saveProjectSilent`, `openProject`, `openProjectFromPath`, `printToPDF`, `savePDF`, `savePNG`, `saveJson`, `openExternal`, `revealFile`, `copyText`.

### 2) Runtime branching in store save/open logic
- `src/store.js`
  - Local file save/open paths branch on `platformService.isDesktop()`.
  - Desktop path uses file paths from bridge (`result.filePath`) and supports `openProjectFromPath`.
  - Browser path uses browser snapshot persistence (`browserProjectId`, `browser:*` pseudo-path entries).

### 3) Desktop-specific UX assumptions
- `src/components/CallsheetTab.jsx`
  - After export/email prep, if desktop + file path exists, calls `platformService.revealFile` and `platformService.copyText`.
- `src/components/Toolbar.jsx`
  - Displays file name by splitting `projectPath` with path separators (`split(/[\\/]/)`).

### 4) Export runtime split (desktop print bridge vs browser fallback)
- `src/components/ExportModal.jsx`
  - Desktop export path calls `platformService.printToPDF` then `platformService.savePDF`.
  - Browser fallback uses html2canvas or `window.open(...).print()` or HTML download.
  - PNG export uses `platformService.savePNG` on desktop, `<a download>` in browser.

### 5) Browser runtime-only APIs already in use
- File picker/import: `document.createElement('input')` + `FileReader` (`platformService.openProject`).
- Downloads: `Blob` + `URL.createObjectURL` + temporary anchor (`platformService`, `scriptTxtSerializer`, export paths).
- Clipboard: `navigator.clipboard.writeText` fallback in `platformService.copyText`.

### 6) What is **not** present in this repo
- No renderer direct `ipcRenderer`/`ipcMain`/`contextBridge` usage outside `window.electronAPI` checks.
- No preload/main process files in this repository tree (renderer assumes optional injected bridge).

## B. Current save/open/export flow map

### Save (local project file)
1. UI action from `Toolbar` calls store `saveProject` / `saveProjectAs`.
2. `store.getProjectData()` builds serializable payload.
3. `materializeCloudImagesForLocalSave` inlines cloud thumbnails into payload for local portability when needed.
4. Branch:
   - Desktop: `platformService.saveProjectSilent(existingPath, json)` or `saveProject(defaultName, json)`.
   - Browser: `platformService.saveProject(defaultName, json)` (download) + `persistBrowserProjectState(...)`.
5. Store updates `projectPath`/`projectRef`, `lastSaved`, `hasUnsavedChanges`, and save/sync status.

### Open/import (project file)
1. UI action triggers store `openProject`.
2. `platformService.openProject()`:
   - Desktop bridge open dialog result, or
   - Browser file input picker + FileReader text.
3. Store parses JSON and calls `loadProject(data)`.
4. Branch:
   - Desktop: persists absolute `projectPath`, updates recent projects by path.
   - Browser: stores snapshot by `browserProjectId`, uses pseudo-path `browser:<id>`.

### Open recent
- Desktop: `openProjectFromPath(path)` using bridge.
- Browser: load snapshot from localStorage by `browserProjectId` and hydrate store.

### Export flows
- Unified export hub in `ExportModal` routes to:
  - PDF (storyboard/shotlist/schedule/callsheet/combined/day): desktop print bridge vs browser print/download fallback.
  - PNG: desktop bridge save vs browser download.
  - Mobile package/snapshot JSON via `src/services/mobile/mobileExportService.js`, which uses `platformService.saveJson(...)`.
  - Script TXT export uses direct browser Blob download (`src/utils/scriptTxtSerializer.js`).

## C. Current persistence flow map

### Local browser persistence
- `platformService` localStorage keys:
  - `autosave`, `autosave_time`
  - `recentProjects`
  - `browserProjectIndex`
  - `browserProject:<id>` snapshots
- Store autosave path (`_scheduleAutoSave`) writes autosave + browser snapshot for non-desktop.
- App lifecycle safety net (`App.jsx`) flushes browser persistence on `beforeunload`, `pagehide`, `visibilitychange`.
- App startup restore reads autosave and prompts user.

### Session-only persistence
- Cloud project continuity key in sessionStorage: `ss_active_cloud_project_id` (`CloudSyncCoordinator` and store open/reset logic).

### Cloud persistence (paid/cloud projects)
- Store writes snapshots via repository adapter (`createCloudProjectAdapter`): `projectSnapshots:createSnapshot`.
- Adapter sanitizes/size-checks via `buildConvexSafeSnapshotPayload` before mutation.
- Deferred hydration path reads latest snapshot for opened cloud project.
- Live scene/shot mutations and snapshot/head queries are coordinated in `CloudSyncCoordinator`.

### Other local persistence surfaces
- Shortcut bindings in localStorage (`src/shortcuts.js`, key `shotScribe.shortcutBindings`).
- Diagnostics flags in localStorage (`src/utils/convexDiagnostics.js`, `src/utils/assetSignedViewCache.js`).
- Mobile app (separate package) persists its own library/session in localStorage (`mobile/src/storage/mobileLibrary.ts`).

## D. Proposed interfaces

## 1) `PlatformAdapter` (runtime + host capabilities)
```ts
export type RuntimeKind = 'desktop' | 'web'

export interface PlatformAdapter {
  getRuntime(): RuntimeKind
  isDesktop(): boolean

  // File dialogs + direct path support (desktop may support both)
  openTextFile(options?: { accept?: string[] }): Promise<{ ok: true; text: string; name?: string; path?: string } | { ok: false; cancelled?: boolean; error?: string }>
  saveTextFile(options: { defaultName: string; text: string; mimeType?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<{ ok: true; path?: string } | { ok: false; cancelled?: boolean; error?: string }>
  saveTextFileAtPath?(path: string, text: string): Promise<{ ok: true; path: string } | { ok: false; error?: string }>

  // OS integration
  openExternal(url: string): Promise<{ ok: boolean; error?: string }>
  revealFile?(path: string): Promise<{ ok: boolean; error?: string }>
  copyText(text: string): Promise<{ ok: boolean; error?: string }>

  // Export-oriented binary helpers
  printHtmlToPdf?(html: string): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; error?: string }>
  saveBinaryFile?(options: { defaultName: string; bytes: ArrayBuffer; mimeType: string }): Promise<{ ok: true; path?: string } | { ok: false; error?: string }>
}
```

## 2) `ProjectStorage` (local project persistence abstraction)
```ts
export interface ProjectStorage {
  // local project identity
  ensureLocalProjectId(existingId?: string | null): string

  // recent entries
  loadRecent(): Array<{ name: string; ref: string; openedAt: string; shotCount?: number }>
  saveRecent(entries: Array<{ name: string; ref: string; openedAt: string; shotCount?: number }>): void

  // autosave
  saveAutosave(payload: unknown): void
  loadAutosave(): { payload: unknown | null; savedAt: string | null }

  // browser snapshot cache (or desktop equivalent no-op)
  saveWorkingSnapshot(localProjectId: string, payload: unknown): void
  loadWorkingSnapshot(localProjectId: string): unknown | null
}
```

## 3) Optional `FileCommandService` / `ExportService`
```ts
export interface FileCommandService {
  saveProjectFile(projectName: string, json: string, opts?: { existingPath?: string | null }): Promise<{ ok: boolean; path?: string; cancelled?: boolean; error?: string }>
  openProjectFile(): Promise<{ ok: boolean; text?: string; pathOrName?: string; cancelled?: boolean; error?: string }>
  exportJson(defaultName: string, json: string, filters?: Array<{ name: string; extensions: string[] }>): Promise<{ ok: boolean; path?: string; error?: string }>
  exportPdfFromHtml(html: string, defaultName: string): Promise<{ ok: boolean; path?: string; error?: string }>
  exportPng(name: string, base64: string): Promise<{ ok: boolean; path?: string; error?: string }>
}
```

## E. Recommended file/module boundaries

### Keep (already close to target)
- `src/services/platformService.js`: keep as bridge boundary; migrate into adapter implementation incrementally.
- `src/data/repository/*`: keep cloud repository adapter pattern for cloud persistence.

### Add (small, reversible)
- `src/platform/PlatformAdapter.ts`
- `src/platform/adapters/webPlatformAdapter.ts`
- `src/platform/adapters/desktopPlatformAdapter.ts` (wraps current electronAPI shape)
- `src/platform/getPlatformAdapter.ts` (runtime selection)

- `src/storage/ProjectStorage.ts`
- `src/storage/localStorageProjectStorage.ts`

- `src/services/fileCommands.ts` (compose `PlatformAdapter` + `ProjectStorage`; no behavior change)

### Migrate call sites in thin slices
1. `store.js` save/open/recent/autosave functions call `fileCommands` + `ProjectStorage` facade.
2. `ExportModal.jsx` and `mobileExportService.js` call `fileCommands` for export writes.
3. `CallsheetTab.jsx` still uses OS helpers through adapter (`openExternal`, `revealFile`, `copyText`).

## F. Exact first code changes to make next

1. Introduce typed interfaces only (no behavior change):
   - Add `src/platform/PlatformAdapter.ts` and `src/storage/ProjectStorage.ts`.
2. Add adapter wrappers that delegate 1:1 to existing `platformService`:
   - `getPlatformAdapter()` returns shim backed by `platformService`.
3. Add `LocalProjectStorage` backed by current localStorage keys unchanged.
4. In `store.js`, replace **only** direct calls for:
   - `loadRecentProjects`, `saveRecentProjects`
   - `saveAutosave`, `loadAutosave`
   - `saveBrowserProjectSnapshot`, `loadBrowserProjectSnapshot`
   with injected `ProjectStorage` shim.
5. Keep `platformService` public API intact for now; no rename/removal in phase 1.
6. Add focused tests for wrapper parity (same outputs/errors for desktop unavailable cases).

## G. Risk list

1. **Recent project compatibility risk**
   - Existing entries contain `path` + optional `browserProjectId`; changing shape too early can break open recent.
2. **Desktop silent-save regression risk**
   - `saveProjectSilent(existingPath)` behavior is critical for Ctrl/Cmd+S expectations.
3. **Cloud-to-local portability risk**
   - `materializeCloudImagesForLocalSave` must still run before local exports.
4. **Export parity risk**
   - Desktop PDF/PNG save paths and browser print/download fallbacks must remain exactly preserved.
5. **Autosave prompt risk**
   - Restore prompt logic depends on autosave data shape and timestamp key.
6. **Path-dependent UX risk**
   - Callsheet “reveal in folder” and copied path must remain desktop-only and non-crashing on web.

## H. Regression checklist

1. Save existing local desktop project (silent overwrite) and verify path unchanged.
2. Save As creates a new local project path and updates recents.
3. Browser save triggers download and updates browser snapshot recents.
4. Open project via dialog in desktop and web.
5. Open recent desktop path and browser snapshot entry.
6. Autosave restore prompt appears for recoverable autosave payload and restores correctly.
7. Export: storyboard/shotlist/schedule/callsheet PDFs still work in both runtime modes.
8. Export PNG still works in both runtime modes.
9. Mobile package and mobile snapshot JSON exports still download/save correctly.
10. Callsheet email flow still opens mail client; desktop still reveals/copies file path.
11. Cloud project local export still materializes cloud image data for portable local files.

---

## Next best implementation prompt

Use this as your Phase 1 prompt:

> Implement Phase 1 for LumaLayout migration with minimal risk and no behavior change. Add `PlatformAdapter` and `ProjectStorage` interfaces, plus shim implementations that delegate 1:1 to existing `platformService` and current localStorage keys. Wire only `store.js` recent-project + autosave + browser snapshot persistence calls through `ProjectStorage` (leave save/open/export command flows unchanged for now). Add targeted tests proving parity of return shapes and failure behavior. Do not refactor core editor logic or cloud sync logic.
