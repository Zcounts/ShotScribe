# Export Workflow Unification (updated June 2026)

## Current export UX

ShotScribe now uses a single **Export** settings modal in `src/components/ExportModal.jsx` instead of a long wall of export action buttons.

The default modal flow is:

1. Choose **Export Type**:
   - Everything
   - Storyboard
   - Shotlist
   - Schedule
   - Callsheet
2. Choose the available **Format** for that type.
3. Choose the available **Scope / Range**.
4. Choose the **Output** mode.
5. Review the readable summary.
6. Click one primary **Export** button.

The modal keeps less common routes under **Advanced / additional exports** so launch-critical PDF/PNG exports stay simple while existing script, mobile JSON, and per-day bundle paths remain reachable.

## Preserved export routing

The UI is intentionally a routing refactor, not an export-engine rewrite. These existing export paths remain available:

- **Everything · Combined PDF** uses the existing complete-export route.
- **Everything · Separate PDF files** runs the existing storyboard, shotlist, schedule, and callsheet PDF exports.
- **Storyboard · PDF** uses the same store-built storyboard print renderer used by the complete PDF route so standalone storyboard PDFs do not diverge from the storyboard section in the combined PDF.
- **Storyboard · PNG** keeps the existing PNG export route.
- **Shotlist · PDF** keeps the existing shotlist export route.
- **Schedule · PDF** exposes standard, expanded, stripboard, and calendar modes through the Output section.
- **Callsheet · PDF** supports the selected shoot day or all callsheets when schedule days exist.

## Error and loading behavior

- Controls are disabled while an export is preparing.
- The primary button changes to `Preparing export…` to prevent double-clicks.
- The modal logs selected export type, format, scope, output mode, generated document/page count, active tab, and stack details when exports start or fail.
- User-facing validation now prefers specific messages such as `Storyboard export generated no pages`, `No schedule days found`, and `No shots found for this scope`.

## Manual QA checklist by export type

> Use a project with at least:
> - 2+ scenes with images
> - 2+ schedule days
> - callsheet data

### Everything combined
1. Open **Export**.
2. Set **Export Type** to **Everything**.
3. Set **Format** to **PDF**.
4. Set **Output** to **One combined PDF**.
5. Click **Export**.
6. Confirm the result still works and storyboard pages match the expected combined-PDF layout.

### Everything separate
1. Open **Export**.
2. Set **Export Type** to **Everything**.
3. Set **Output** to **Separate PDF files**.
4. Click **Export**.
5. Confirm storyboard, shotlist, schedule, and callsheet PDFs are produced correctly.

### Storyboard PDF
1. Open **Export**.
2. Set **Export Type** to **Storyboard**.
3. Set **Format** to **PDF**.
4. Confirm **Scope / Range** says **All pages**.
5. Click **Export**.
6. Confirm the PDF exports correctly and matches the storyboard section of the combined PDF.

### Storyboard PNG
1. Open **Export**.
2. Set **Export Type** to **Storyboard**.
3. Set **Format** to **PNG**.
4. Confirm **Output** says **Individual PNG files/pages**.
5. Click **Export** and verify PNG files are readable.

### Shotlist PDF
1. Open **Export**.
2. Set **Export Type** to **Shotlist**.
3. Click **Export**.
4. Verify the shotlist PDF includes expected shots and grouping.

### Schedule PDFs
1. Open **Export**.
2. Set **Export Type** to **Schedule**.
3. Run each **Output / Schedule Mode** option:
   - Standard schedule
   - Expanded schedule
   - Stripboard
   - Calendar
4. Confirm each generated file is valid and readable.

### Callsheet PDF
1. Open **Export**.
2. Set **Export Type** to **Callsheet**.
3. Select **Selected shoot day** and export.
4. Select **All callsheets** and export.
5. Confirm day selection and PDF output are correct.

### Advanced / additional exports
1. Open **Advanced / additional exports**.
2. Verify Script TXT still downloads.
3. Verify Mobile Day Package and Mobile Snapshot JSON exports still download and parse.
4. Verify per-day PDF bundles still produce shotlist + schedule + callsheet for the selected day.
