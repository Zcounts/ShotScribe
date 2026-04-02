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
