# Responsive Main App Plan (Desktop-First)

Date: 2026-04-02
Scope: Main app in `src/` only. The standalone `mobile/` app remains untouched.

## 1) Audit summary

### Current state at a glance
- The root shell is desktop-first with full viewport locking (`height: 100vh`, `overflow: hidden`) and tab content areas handling their own scroll.
- Most major surfaces use fixed/floor widths or wide minimums (left sidebars at ~240px, configure drawer up to 400px, several table/grid areas with width floors).
- Layout behavior is mostly component-local via inline style objects, with limited shared responsive primitives.
- There are very few global responsive rules today; one explicit media query exists for Shot Properties dialog internals (`@media (max-width: 900px)`).

### Desktop safety conclusion
- Desktop behavior is coherent and should be preserved.
- Responsive work should be phased behind shared primitives and viewport capability checks to avoid desktop regressions.

## 2) Main layout architecture

### Global app shell
- `App` owns the top-level shell, toolbar, auth/session bars, top tab nav, and tab-level routing/rendering by `activeTab`.
- Global shell currently assumes a desktop window and keeps the app in a fixed viewport-height frame.
- Storyboard, Cast/Crew, and Callsheet configure overlays are mounted from `App` with fixed-position scrims and side drawers.

Primary files:
- `src/App.jsx`
- `src/components/Toolbar.jsx`
- `src/components/ConfigureSidebarShell.jsx`
- `src/index.css`

### Shared layout primitives in active use
- `SidebarPane` is the shared left rail wrapper used by multiple tabs.
- `ConfigureSidebarShell` is the shared right off-canvas drawer shell for configure panels.
- `SubTabNav` is used for compact segmented secondary navigation.
- `DayTabBar` is used in schedule/callsheet day switching.

Primary files:
- `src/components/SidebarPane.jsx`
- `src/components/ConfigureSidebarShell.jsx`
- `src/components/SubTabNav.jsx`
- `src/components/DayTabBar.jsx`

### Major tab-level layout patterns
- **Sidebar + main canvas split**: Home, Scenes, Shotlist, Schedule, Cast/Crew, Callsheet.
- **Dense document/canvas + optional left outline**: Storyboard.
- **Three-pane editor pattern with panel heights and document viewport**: Script.
- **Data-heavy tables**: Shotlist + Callsheet + parts of Cast/Crew.

## 3) Shared responsive strategy (hybrid app UX)

Recommended hybrid behavior for main app:
1. Keep desktop behavior unchanged at wide breakpoints.
2. Convert persistent left/right side panels into toggled off-canvas panels below desktop width thresholds.
3. Keep one primary editing surface visible at a time on small widths (focus mode), with explicit access paths to all controls.
4. Allow selective horizontal scrolling for dense data tables, while ensuring toolbars/filters/actions remain reachable.
5. Prefer shared utility classes/hooks (viewport buckets + panel behavior flags), then consume inside existing tab components.

## 4) Breakpoint recommendations

Use semantic buckets (not per-component arbitrary breakpoints):
- `xl` desktop: `>= 1280px` (current baseline behavior)
- `lg` desktop / small laptop: `1024px – 1279px`
- `md` tablet landscape: `768px – 1023px`
- `sm` tablet portrait / large phone: `600px – 767px`
- `xs` phone: `< 600px`

Behavioral rules:
- Keep persistent dual sidebars only at `>= lg`.
- At `md/sm/xs`, move left rails and configure sidebars to explicit off-canvas open/close controls.
- On `xs/sm`, force single-column content for card grids where practical (Storyboard shot cards full-width; scene/workflow cards collapse progressively).

## 5) Area-by-area audit findings

## Global app shell
- Desktop assumptions:
  - Root app frame is fixed to viewport height with overflow clipped.
  - Top tab nav is a single-row horizontal strip with no built-in wrap/overflow controls.
- Risk:
  - Narrow widths can cause action clipping and inaccessible controls.

## Top toolbar / header actions
- Heavy action density (project identity, save/open/export/account) in one horizontal row.
- Multiple dropdown menus use fixed min-width panels.
- Risk:
  - At smaller widths, controls likely compress poorly before user can access menus.

## Primary tab navigation
- Fixed horizontal tab button row with wide per-tab paddings and uppercase labels.
- No explicit horizontal scrolling container behavior is implemented in this strip.
- Risk:
  - Overflow/cutoff on tablet portrait and phone widths.

## Left project/sidebar areas
- Shared left sidebar has fixed width tokens (`--ss-left-sidebar-width: 240px`) and no responsive collapse behavior.
- Tabs frequently rely on always-visible left rail controls.
- Risk:
  - Content area becomes too narrow; sidebar crowds main work surface.

## Right configure drawer / side panels
- Configure sidebar is fixed-position and width-clamped to `min(400px, calc(100vw - 24px))`.
- Existing behavior is already off-canvas by animation, but trigger/discovery patterns are desktop-centric.
- Risk:
  - On phone widths the drawer can dominate the viewport and needs stronger step-in/out UX.

## HOME tab
- Uses sidebar + main canvas + fixed bottom footer anchored to `left: var(--ss-left-sidebar-width)`.
- Grid sections use fixed column counts (workflow: 5 cols, quick actions: 3 cols).
- Fragility:
  - Footer anchoring assumes persistent left sidebar width.
  - Hero typography and multi-column sections are likely to overflow on smaller widths.

## SCRIPT tab
- Multi-pane desktop editor with left script sidebar and right content/editor panels.
- Selection popovers are `position: fixed` at selection coordinates.
- Fragility:
  - Dense three-pane layout and fixed popovers are high-risk for small viewports.

## SCENES tab
- Left sidebar + configurable main view with grid/list modes.
- Grid column counts are desktop-oriented; cards include dense metadata.
- Fragility:
  - View controls and card density can become cramped before graceful wrapping.

## STORYBOARD tab
- Optional left outline sidebar + page canvas; shot grid uses fixed column count chosen from settings.
- `ShotGrid` uses `gridTemplateColumns: repeat(columnCount, 1fr)`.
- Fragility:
  - User-selected multi-column layouts may produce unreadable cards on tablets/phones.

## CAST/CREW tab
- Left sidebar + data tables/visual matrix.
- Table headers/cells rely on sticky columns and minimum widths.
- Fragility:
  - Matrix/table readability on narrow widths requires controlled horizontal overflow strategy.

## SHOTLIST tab
- Left sidebar + large configurable fixed-layout table with explicit width floor (`Math.max(totalTableWidth, 980)`).
- Sticky columns and dense header controls.
- Fragility:
  - High-risk responsive area; should use “desktop table mode + compact card mode” phases rather than immediate rewrite.

## SCHEDULE tab
- Left sidebar + multi-mode main content (list/stripboard/calendar).
- Stripboard uses `auto-fit` with per-column minimum widths; multiple fixed-position popovers/menus.
- Fragility:
  - Better than pure fixed grid in some views, but still assumes roomy canvas and persistent sidebar.

## CALLSHEET tab
- Left warning/summary sidebar + main document canvas with many table-like sections.
- Several grids use 2/4-column assumptions and multiple inline field clusters.
- Fragility:
  - Complex forms and dense section tables need staged responsive adaptation.

## Shared cards/tables/grids/forms/drawers/modals
- Common patterns likely to drive responsive defects:
  - Fixed min-widths in buttons/menus/dialog content.
  - Dense inline style grids with hard-coded column counts.
  - Fixed-position popovers and dropdowns anchored to desktop hit targets.
  - Wide table assumptions requiring explicit horizontal handling.

## 6) Most fragile views first (risk-ranked)

1. Shotlist (wide fixed table + sticky columns)
2. Callsheet (dense multi-section form/table hybrid)
3. Script (multi-pane editor with fixed overlays)
4. Storyboard (card density + outline panel competition)
5. Schedule (multiple modes + fixed overlays)
6. Home / Scenes / Cast-Crew (moderate; mostly sidebar and grid tuning)

## 7) Hard-coded desktop assumptions to unwind carefully

- Global fixed viewport shell (`100vh` + clipped overflow).
- Persistent 240px left rail expectation across multiple tabs.
- Single-row action-heavy toolbar and tab strip assumptions.
- Grid/table patterns with explicit column counts and width floors.
- Fixed-position menus/popovers that do not adapt positioning strategy by viewport class.

## 8) Phased implementation roadmap (desktop-first)

## Phase 0 — Foundation + guardrails (safe prep)
- Add shared responsive vocabulary:
  - viewport bucket hook (e.g., `useViewportClass`)
  - central breakpoint constants
  - helper booleans (`isTabletOrBelow`, `isPhone`)
- Add responsive QA checklist and per-tab acceptance criteria.
- No visual redesign yet; no behavior change at desktop widths.

Exit criteria:
- Desktop screenshots/interactions unchanged.
- Shared responsive utilities available for tabs.

## Phase 1 — Global shell + navigation containment
- Make top toolbar and top tab nav overflow-safe with explicit horizontal scroll/wrap strategy and preserved action access.
- Introduce a global “panel toggle affordance” pattern for sub-desktop widths.
- Keep desktop nav appearance intact.

Exit criteria:
- All toolbar and tab actions reachable at `md/sm/xs`.
- No desktop spacing regressions.

## Phase 2 — Shared side panel behavior
- Apply shared off-canvas behavior to `SidebarPane` consumers at `md` and below.
- Keep right configure drawers but refine small-viewport sizing and close mechanics.
- Ensure keyboard/scrim close behavior remains consistent.

Exit criteria:
- Left and right panels never permanently block narrow screens.
- Every panel has an alternate access path.

## Phase 3 — Content density adaptations per tab
- Home/Scenes/Cast-Crew first (lower risk): adjust grids, section stacking, and table wrappers.
- Storyboard next: enforce full-width shot cards at smaller buckets and optional outline drawer mode.
- Schedule next: tighten list/strip/calendar controls, keep drag/drop usability.
- Shotlist and Callsheet last with controlled compact patterns and explicit fallbacks.

Exit criteria:
- Function parity retained.
- No critical action hidden without an alternate route.

## Phase 4 — Hardening + regression matrix
- Full regression sweep across desktop + tablet + phone breakpoints.
- Verify dialogs, context menus, DnD affordances, save/sync controls, export entry points, and configure flows.

## 9) Specific files/components likely to be edited in next pass

High probability (shared/global):
- `src/App.jsx`
- `src/index.css`
- `src/components/Toolbar.jsx`
- `src/components/SidebarPane.jsx`
- `src/components/ConfigureSidebarShell.jsx`
- `src/components/SubTabNav.jsx`
- `src/components/DayTabBar.jsx`

Per-tab likely:
- `src/components/HomeView.jsx`
- `src/components/HomeView.css`
- `src/components/ScriptTab.jsx`
- `src/components/ScenesTab.jsx`
- `src/components/ShotGrid.jsx`
- `src/components/ShotlistTab.jsx`
- `src/components/ScheduleTab.jsx`
- `src/components/CallsheetTab.jsx`
- `src/components/CastCrewTab.jsx`

## 10) Desktop safety notes / regression checklist

Always verify after each responsive phase:
- Toolbar save/open/export/account flows still reachable and unchanged on desktop.
- Top tab nav visual style and switching behavior unchanged on desktop.
- Storyboard drag-and-drop still works, including outline drag and add-page controls.
- Script editor typing/selection/tagging flows unchanged.
- Shotlist table resize/sticky headers/inline edit still function.
- Schedule list/strip/calendar DnD interactions still function.
- Callsheet editing + day switching + export/email preflight still function.
- Cast/Crew visual matrix and list tables still readable and interactive.
- Configure drawers and scrims close reliably (click outside + close button).

## 11) Minimal changes made in this pass

- Added this planning document only.
- No runtime UI behavior was changed in this pass to protect desktop stability.

## 12) Phase 1 implementation notes (2026-04-02)

- Added shared breakpoint constants and a viewport hook for the main app shell (`src/constants/responsive.js`, `src/hooks/useResponsiveViewport.js`).
- Updated `App` shell metadata and primary tab nav container to support horizontal overflow instead of clipping at narrower widths.
- Added shared responsive behavior to `SidebarPane`:
  - Desktop: existing persistent sidebar behavior preserved.
  - `< 1024px`: toggle button + off-canvas left drawer + scrim + escape-to-close.
- Tuned toolbar and configure drawer responsiveness in `src/index.css` with desktop-preserving defaults and narrow-screen adjustments.
- Added Home-specific footer/grid safeguards for narrow widths to avoid fixed-offset footer overlap.

## 13) Phase 2 implementation notes (2026-04-02)

- Continued responsive work for lighter/core tabs only (HOME, SCRIPT, SCENES, CAST/CREW) while leaving Storyboard/Shotlist/Schedule/Callsheet untouched for deeper adaptation.
- HOME:
  - Improved tablet/phone card and stats reflow for clearer dashboard hierarchy.
- SCRIPT:
  - Added compact-mode panel controls and off-canvas behavior for script-side and inspector-side panels at `< 1024px`.
  - Added controlled horizontal overflow for the page canvas area on smaller screens to avoid clipped writing surfaces.
- SCENES:
  - Added viewport-aware column count clamping so scene cards do not collapse into unreadable dense grids on tablet/phone.
- CAST/CREW:
  - Added responsive spacing updates and explicit horizontal table wrappers for list-heavy views so data remains reachable on narrow screens.
