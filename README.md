# Storyboard — Film Shotlist Desktop App

## Full Project Specification

Build a Windows 11 desktop application (using Electron + React) for creating professional film shotlists/storyboards. The app should replicate the exact visual format shown below and support full project save/load functionality.

## Layout & Document Structure

The document is a paginated, print-ready shotlist. Each page has:

A page header spanning the full width with three sections:
- Left: Scene label (e.g., "SCENE 1 | CLUB | INT") in large bold text
- Center: A *NOTE and *SHOOT ORDER freetext block for director/AD notes
- Right: Camera designation badge (e.g., "Camera 1 = fx30") + "SHOTLIST" title in large bold

A 4-column grid of shot cards below the header, with as many rows as needed. Cards flow left-to-right, top-to-bottom. A page number centered at the bottom of each page.

## Shot Card Structure

Each shot card must contain exactly these elements, stacked vertically:

**Card Header Row** (single line, above the image):
- A small colored square indicator (user can pick color: green, cyan, yellow, red, etc. — used to group/camera-code shots)
- Shot ID + Camera name (e.g., "1A - Camera 1")
- Focal length (e.g., "85mm") right-aligned

**Image Area:**
- A fixed-aspect-ratio (16:9) image placeholder
- Clicking it opens a file picker to upload a local image (JPG, PNG, WEBP)
- Uploaded image fills the area with object-fit: cover
- The image area has a colored border matching the indicator color
- If no image uploaded, show a neutral gray placeholder with a "+" icon

**Specs Table:**
- A 4-column table with bold headers: SIZE | TYPE | MOVE | EQUIP
- One editable row below headers
- SIZE examples: WIDE SHOT, MEDIUM, CLOSE UP, OTS
- TYPE examples: EYE LVL, SHOULDER LVL, CROWD LVL
- MOVE examples: STATIC, PUSH, STATIC or PUSH
- EQUIP examples: STICKS, GIMBAL, STICKS or GIMBAL
- Each cell is a dropdown OR free-text input (user preference toggle in settings)

**Notes/Description Area:**
- Freetext block below the table
- Supports labeled prefixes that render in bold: ACTION:, BGD:, EST:, SHOOT ORDER:
- Multi-line, auto-expanding

## Shot Card Interactions

- **Add Shot:** Button to add a new shot card (appends to end of grid)
- **Delete Shot:** X button on hover in card corner
- **Reorder Shots:** Drag and drop to reorder cards; shot IDs (1A, 1B, 1C...) auto-update sequentially
- **Duplicate Shot:** Right-click context menu option
- **Card Color:** Color picker on the indicator square to assign camera/group color

## Project Management

- **New Project:** Creates blank shotlist, prompts for Scene name
- **Save Project:** Saves to a .shotlist JSON file (includes all shot data + embedded images as base64)
- **Load Project:** Opens a .shotlist file and restores full state
- **Auto-save:** Optional auto-save every 60 seconds to a temp file
- **Recent Projects:** List of recently opened files on the home screen

## Export

- **Export to PDF:** Renders the full shotlist document to a paginated PDF matching the on-screen layout exactly using Puppeteer. Print-ready at A4 or Letter size, landscape.
- **Export to PNG:** Export each page as a high-res PNG

## Global Document Settings

- Scene name / location / INT or EXT toggle
- Camera name and body (e.g., "Camera 1 = fx30")
- Default focal length
- Number of columns (default: 4, allow 2 or 3)
- Font and accent color theme (light/dark background)

## Tech Stack

- Electron + React + TailwindCSS
- Zustand for state management
- dnd-kit for drag and drop
- Puppeteer (bundled with Electron) for PDF export
- Images stored as base64 strings inside the JSON project file
- Warning displayed if total project file size exceeds 50MB

## Visual Style

Cream/off-white background, clean sans-serif font, bold column headers in the specs table, colored left/top border accents on each card matching the indicator color, professional print-document aesthetic.

## Build Sessions

- Session 1: Scaffold ✅
- Session 2: ShotCard component
- Session 3: Page layout and grid
- Session 4: State and interactions
- Session 5: Save/load and settings
- Session 6: Export and final polish
