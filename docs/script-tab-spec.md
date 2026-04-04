# Script Tab Spec

## 1. Product goal
The Script tab should become a true WYSIWYG screenplay editor that is good enough to:
- write a screenplay from scratch
- import and refine an existing screenplay
- break down the script for production
- visualize shot-linked script ranges without breaking the writing experience

It should feel:
- visually closer to scriptOdd
- interaction-wise closer to Google Docs / Word
- screenplay-wise closer to Final Draft

The page is the hero.
The editor must feel calm, minimal, document-first, and reliable.

---

## 2. Non-negotiables
These are hard requirements.

- Real paginated pages at all times
- No infinite canvas
- Edit mode and non-edit mode must use the same page model
- User-facing measurements must be in inches
- Script data must remain connected to all other tabs
- Scenes parsed from the script must remain stable identifiers
- Script text ranges linked to shots or breakdown items must persist and remain inspectable
- PDF/export pagination should match on-screen pagination as closely as possible
- Breakdown and Visualize must never mutate text layout

---

## 3. Script tab structure
The Script tab has 3 views.

### A. Write
Purpose:
- write and edit the script directly on the page

Behavior:
- direct typing on the page
- normal caret, selection, paste, undo/redo
- screenplay-aware Enter / Tab / Shift+Tab / Backspace behavior
- page setup and element style controls available, but secondary

### B. Breakdown
Purpose:
- assign and inspect production breakdown data tied to script text and scenes

Examples:
- cast
- props
- wardrobe / costumes
- makeup
- vehicles
- music
- locations
- notes
- other production tags

Behavior:
- text can be selected and linked to breakdown entities
- selected ranges must remain attached to the script text
- breakdown data must remain connected to scene records and downstream tabs

### C. Visualize
Purpose:
- link script ranges to shots and inspect those links visually

Behavior:
- selecting or double-clicking a linked range reveals associated shot data
- linked text remains visibly highlighted
- highlight styling must be clear and not damage readability
- script-to-shot linking must remain stable as the document is edited

---

## 4. Core interaction rules
- The page itself is the main editing surface
- Users should not primarily edit through detached side-panel forms
- The UI should remain minimal and calm, like scriptOdd
- Top app nav remains consistent with the rest of ShotScribe
- Left sidebar remains, but can contain more than scenes over time
- Secondary controls should not overpower the page

---

## 5. Measurement model
User-facing measurements must be shown in inches.

Allowed user-facing inch-based settings:
- page width
- page height
- top margin
- right margin
- bottom margin
- left margin
- element indents
- spacing values where appropriate

Internally, conversion to px at 96 dpi is allowed, but inches are the source-of-truth display unit.

---

## 6. Screenplay format contract
### Page
- Paper size: 8.5" x 11"
- Top margin: 1.0"
- Right margin: 1.0"
- Bottom margin: 1.0"
- Left margin: 1.5"

### Typography
- Font: Courier Prime preferred, Courier New fallback
- Size: 12 pt
- Monospaced only

### Elements
The renderer must use real element geometry, not visual nudges.

Required element types:
- Scene Heading
- Action
- Character
- Dialogue
- Parenthetical
- Transition
- Centered Text

General rules:
- Scene Heading and Action align to the left text margin
- Dialogue is narrower than Action
- Parenthetical is narrower than Dialogue
- Character cues follow screenplay element indent rules
- Transition aligns right within the usable text area

### Pagination
- The document must render as discrete pages in both read and edit states
- Page breaks must remain visible and stable
- On-screen pagination and PDF/export pagination must match as closely as possible

---

## 7. Data integrity contract
This is critical.

- Scene records derived from the script are source-of-truth objects
- Scene IDs must stay stable when possible
- Script edits must not silently break connections to:
  - scenes
  - shots
  - storyboard
  - shotlist
  - cast/crew
  - schedule
  - call sheet
  - breakdown entities
- Text range links must be stored in a way that can survive normal editing operations as reliably as possible
- If an edit invalidates a linked range, the app should degrade gracefully rather than silently deleting useful data

---

## 8. Writing behavior
When there is no script loaded, show 2 primary actions:
- Upload Script
- Write Script

### Keyboard behavior
- Tab cycles screenplay element type in a logical order
- Shift+Tab cycles backward
- Enter creates the next logical screenplay element
- Backspace at the start of a block merges that block with the previous block when appropriate
- Paste from plain text should produce sensible screenplay blocks where possible
- Paste from screenplay-formatted text should preserve screenplay structure where possible

These flows must feel good enough to write a script from scratch.

---

## 9. Formatting surfaces
Formatting should use one compact inspector surface with grouped controls.

### Page & Styles Inspector
Contains:
- page setup controls (paper size + margins)
- element style controls (per-element indent values and related formatting controls)
- quick mode toggles (All / Page / Paragraph) so setup is dense and scan-friendly

These surfaces are secondary.
They must not replace direct on-page editing.

---

## 10. Ruler behavior
- The ruler must be useful, not decorative
- It must reflect real page geometry
- It must use inches
- It must reflect actual active element settings
- Dragging ruler markers must change real element or page values

If the ruler cannot be made trustworthy, it should be simplified rather than faked.

---

## 11. Visual direction
Target structure:
- left sidebar
- centered paginated page canvas
- restrained top toolbar
- minimal secondary panels
- calm, warm, scriptOdd-like feel

Avoid:
- giant always-open inspectors
- debug-looking layout controls
- pixel-oriented UI
- custom web-app feel that fights the document

- Keep SCRIPT document controls compact: title, cloud status, and Save Snapshot/Lock scene/Unlock should share one top row when layout allows.
- Keep Script Settings tabs focused on Estimation + Pagination for the launch-safe panel.

Do not copy StudioBinder structurally.
The structural visual target is closer to scriptOdd.
StudioBinder is relevant as a reference for production-linking concepts like highlighted linked text and tagging popovers.

---

## 12. View isolation contract
Only the active Script view may show its interaction layer.

### Write
- editable document
- no breakdown highlights
- no shot-linked cards
- no tagging popovers

### Breakdown
- read-focused document
- breakdown highlights visible
- tagging popover enabled
- no shot-linked cards or shot-link sidebar panel

### Visualize
- read-focused document
- shot-linked highlights visible
- shot cards/sidebar visible
- no breakdown category panel or tagging UI

No inactive-view UI may remain visible or active.

---

## 13. Annotation / overlay contract
Breakdown tags and shot links are annotations, not text layout.

Requirements:
- highlights must not alter text metrics
- highlights must not change line wrapping
- highlights must not insert inline controls into text flow
- popovers must be anchored overlays, not inline content
- linking text to shots or breakdown items must not move surrounding text
- annotation rendering must sit on top of the document, not inside the document structure

---

## 14. Sidebar panel contract
The left sidebar below the view buttons is split into two stacked regions:
1. view-specific panel
2. scene panel

Behavior:
- separated by a draggable horizontal splitter
- splitter resizes vertically only
- both regions have minimum heights
- both regions can collapse to header rows
- heights and collapsed states persist
- resizing the sidebar must not affect page text width or page layout

### View-specific panel
Changes by active view.

#### Write
- page setup access
- element styles access
- writing-related controls only

#### Breakdown
- breakdown categories with counts
- controls related to tagging and filtering breakdown entities

#### Visualize
- scene-linked shots
- linked shot range counts
- controls related to shot-link inspection

### Scene panel
- remains visible below the view-specific panel
- clicking a scene scrolls to that scene heading
- active scene is visually selected
- scene rows can show metadata like linked shot ranges
- row height can be adjusted by resizing the scene panel, not by reflowing the page

### Splitter behavior
Use Photoshop-style panel resizing:
- drag handle sits between the two sidebar regions
- cursor changes to row-resize
- dragging resizes only the two neighboring regions
- live resizing while dragging
- clamped by minimum heights
- releasing preserves the new heights
- collapsing a region reduces it to a header row, not zero height

---

## 15. Selection behavior contract
Selection behavior changes by view.

### Write
- normal text selection for editing
- no tagging or shot-link popovers

### Breakdown
- selection creates a breakdown tag candidate
- selection opens a tagging popover anchored to the selected range
- double-click on a tagged range opens its breakdown details

### Visualize
- selection creates a shot-link candidate
- selection opens a shot-link UI anchored to the selected range
- double-click on a linked range opens the associated shot

Selections in Breakdown and Visualize must not become broken editable text fields.

---

## 16. Current phase plan
### Phase 1
Rebuild the Script tab shell and document surface
- document-first structure
- stable page rendering
- same page model in edit and non-edit states

### Phase 2
Fix screenplay geometry
- page size
- margins
- line density
- element widths and indents
- stable pagination

### Phase 3
Restore direct writing experience
- caret
- selection
- typing
- delete
- paste
- undo/redo

### Phase 4
Restore screenplay-aware keyboard flow
- Tab
- Shift+Tab
- Enter
- Backspace-at-start behavior

### Phase 5
Restore production-linking workflows
- breakdown tagging
- shot-linked highlighted ranges
- double-click to inspect linked shot
- preserve data connections to other tabs

### Phase 6
Polish formatting surfaces
- Page Setup
- Element Styles
- ruler behavior
- export parity

Work on one phase at a time.
Do not mix phases unless needed to fix a blocker.

---

## 17. Acceptance checklist
A change is not done unless all are true:

- The Script tab still builds successfully
- Pages remain discrete and paginated
- No infinite-canvas regression
- Edit and non-edit states look the same in page layout
- Measurements shown to the user are in inches
- Screenplay formatting is closer to standard, not farther away
- The page remains the visual focus
- Direct writing feels better, not clunkier
- Script-linked scenes and ranges remain connected to the rest of the app
- Shot-linked text highlighting works and remains inspectable
- Breakdown tags do not appear in Write or Visualize
- Shot-linked UI does not appear in Write or Breakdown
- Adding tags or shot links does not move text or rewrap lines
- Scene panel click-to-jump works
- Sidebar splitter resize works reliably
- The result feels closer to scriptOdd in structure and calmer in use

---

## 18. Immediate direction
Right now the biggest problems are:
- view isolation is broken
- annotation layers are mutating document layout
- scene panel behavior is broken
- resize behavior is broken
- shot-linking is unstable
- the Script tab still does not feel trustworthy enough to write in or link from

So the next work should focus on:
- strict view isolation
- non-destructive overlay architecture
- sidebar splitter and scene jump behavior
- stabilizing shot-link and breakdown-tag behavior
- avoiding more document-surface corruption
