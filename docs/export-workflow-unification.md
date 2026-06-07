# Export Workflow Unification (April 2026)

## Audit summary (before this change)

### Existing export entry points
1. **Toolbar export split-button + dropdown**
   - Opened a toolbar-only modal with separate `PDF / PNG / Mobile` tabs.
2. **App-level `ExportModal`**
   - Opened via toolbar `onExportPDF` callbacks.
   - Contained its own PDF-focused structure with overlapping actions.
3. **Callsheet sidebar**
   - Separate direct action: `Export Callsheet PDF`.

### Key inconsistencies found
- Two different export dialogs existed at once (toolbar modal and app modal).
- Export actions were duplicated (`Storyboard PDF`, `Shotlist PDF`, etc.) across sections.
- Some options were context-conditional in ways that felt arbitrary (schedule format options only surfaced in schedule context).
- Callsheet had a standalone export path, bypassing the main export UI.
- No single “source of truth” view that explained what each export produces.

## What changed

- Consolidated export UX into a single **Export Hub** (`src/components/ExportModal.jsx`).
- Updated toolbar to open only that unified hub.
- Updated callsheet sidebar action to route into the same hub.
- Grouped exports by clear launch categories:
  - Storyboards
  - Shotlists
  - Schedules
  - Callsheets
  - Reports
- Added explicit output descriptions for each action.
- Marked unsupported **Reports** export as disabled (graceful, non-broken state).
- Preserved existing export generation logic (PDF/PNG/mobile functions) and reused it through a cleaner UI surface.

## Manual QA checklist by export type

> Use a project with at least:
> - 2+ scenes with images
> - 2+ schedule days
> - callsheet data

### Storyboards
1. Open **Export Hub**.
2. Run **Storyboard PDF**.
3. Verify PDF downloads/saves and includes storyboard pages.
4. Run **Storyboard PNG**.
5. Verify PNG files are downloaded/saved and readable.

### Shotlists
1. Open **Export Hub**.
2. Run **Shotlist PDF**.
3. Verify shotlist table includes expected shots and grouping.

### Schedules
1. Open **Export Hub**.
2. Run **Schedule PDF** and verify baseline schedule layout.
3. Run **Expanded Schedule PDF** and verify expanded row detail.
4. Run **Stripboard PDF** and verify stripboard structure.
5. Run **Calendar PDF** and verify monthly schedule calendar output.

### Callsheets
1. Open **Export Hub**.
2. Run **Callsheet PDF**.
3. Verify one callsheet page per shoot day and expected callsheet fields.

### Reports (unsupported)
1. Open **Export Hub**.
2. Verify **Reports Export (Not Yet Supported)** is visibly disabled.
3. Verify no broken click path appears.

### Mobile on-set packages
1. Open **Export Hub**.
2. Select a day and run **Mobile Day Package (JSON)**.
3. Verify JSON export downloads/saves and parses.
4. Select multiple days and run **Mobile Snapshot (JSON)**.
5. Verify JSON export downloads/saves and parses.

### Whole project exports
1. Run **Everything — One Combined PDF** and confirm one large combined file.
2. Run **Everything — Separate PDF Files** and confirm separate files are produced.
3. Run a **Per-Day PDF Bundle** entry and confirm shotlist + schedule + callsheet for that day.

## Export reliability follow-up (June 2026)

- Standalone **Storyboard PDF** now uses the same store-driven storyboard print HTML builder as **Everything — One Combined PDF**. This keeps storyboard page layout, image rendering, shot labels, camera/lens/spec/note visibility, and pagination aligned with the known-good combined export path.
- Browser fallback rendering for standalone storyboard PDF/PNG now renders generated print HTML in an offscreen iframe and captures `.page-doc` pages from that generated document instead of relying on the currently visible Storyboard tab DOM. Storyboard exports should work even when the user opens Export Hub from Shotlist, Schedule, or Callsheet.
- Standalone **Shotlist PDF** also uses generated print HTML in browser fallback mode rather than the live shotlist tab container.
- Export Hub actions now set action context before running so failures log export type, selected action label, active tab, project name, page counts/selectors when available, and stack traces.

### Regression QA for this follow-up
1. From the **Shotlist** tab, open Export Hub and run **Storyboard PDF**. Confirm no `No pages could be rendered` alert appears and the PDF matches the storyboard section of the combined export.
2. Run **Storyboard PNG** and confirm every generated PNG has visible storyboard content and non-zero dimensions.
3. Run **Everything — One Combined PDF** and confirm page order/styling remain Storyboard, Shotlist, Schedule, Callsheet.
4. Run **Everything — Separate PDF Files** and confirm the generated Storyboard PDF uses the same layout as the standalone Storyboard PDF.
