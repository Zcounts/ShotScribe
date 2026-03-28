# Script Tab Spec

## 1. Product goal
The Script tab should become a true WYSIWYG screenplay editor that is good enough to write a script from scratch.

It should feel:
- visually closer to scriptOdd
- interaction-wise closer to Google Docs / Word
- screenplay-wise closer to Final Draft

The page is the hero.
The editor should feel calm, minimal, and document-first.
It should not feel like a custom inspector-heavy layout tool.

---

## 2. Visual direction
Target structure:
- left scene/sidebar navigation
- centered page canvas
- restrained top toolbar
- optional secondary controls, not always-open heavy panels

Avoid:
- giant always-open inspectors
- debug-looking controls
- pixel-oriented UI
- custom layout-tool feel

The visual design should be warm, minimal, and clean like scriptOdd.

---

## 3. Core interaction rules
- Direct typing on the page is the default workflow
- Caret, selection, typing, delete, paste, undo/redo should feel normal
- Page setup is secondary
- Element styles are secondary
- The ruler should be lightweight and useful, not decorative
- Do not make users primarily edit through detached side-panel forms

---

## 4. Measurement model
User-facing measurements must be in inches.

Internally, px conversion is allowed at 96 dpi, but the UI must show inches for:
- page width
- page height
- top/right/bottom/left margins
- element indents
- spacing values where appropriate

---

## 5. Screenplay format contract
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
These should be driven by real layout values, not visual nudges.

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
- Character cue is positioned by screenplay element indent rules
- Transition aligns right within the usable text area

### Pagination
- Must remain true page-based layout in read and edit mode
- On-screen pagination and PDF/export pagination must match as closely as possible
- Do not collapse pages into one tall canvas

---

## 6. UX priorities
In priority order:

1. Stable paginated pages
2. Accurate screenplay geometry
3. Direct on-page editing
4. Inches-based ruler and page setup
5. Screenplay keyboard flow
6. Secondary element-style controls

---

## 7. Current phase plan
### Phase 1
Fix shell + page geometry only
- centered page
- clean scriptOdd-like structure
- restrained top controls
- no giant always-open inspector
- stable pages

### Phase 2
Fix screenplay formatting only
- margins
- line density
- dialogue width
- character placement
- parenthetical placement
- transition alignment

### Phase 3
Fix direct editing
- click on page and type
- selection/caret behavior
- delete/paste/undo/redo

### Phase 4
Add screenplay writing flow
- Tab / Shift+Tab element cycling
- Enter behavior
- Backspace-at-start behavior

### Phase 5
Polish secondary controls
- Page Setup
- Element Styles
- ruler behavior
- export parity

Work on one phase at a time.
Do not mix phases unless required to fix a blocker.

---

## 8. Acceptance checklist
A change should not be considered done unless all are true:

- Pages remain discrete and paginated
- No infinite-canvas regression
- The Script tab still builds successfully
- Read mode and edit mode use the same page model
- The page remains the main focus visually
- Measurements shown to the user are in inches
- Formatting is closer to screenplay standards, not farther away
- The result feels less clunky, not more
- The change does not add unnecessary UI chrome

---

## 9. Immediate direction
Right now the biggest problems are:
- margins/geometry still feel wrong
- the editor still feels clunky
- the UI still feels too custom and inspector-driven

So the next work should focus on:
- shell simplification
- page geometry accuracy
- better document-first editing behavior

Do not add more complexity before those improve.
