# shadcn/ui Migration Foundation (Web App)

Date: 2026-04-02
Scope: root web app only (`src/`, root `vite`/Tailwind config). Mobile app in `mobile/` intentionally untouched.

## Detected baseline

- Build tool: Vite 5 with React plugin (`vite.config.js`).
- Language mode in web app: JavaScript/JSX (no root TS config; root entrypoint is `src/main.jsx`).
- Tailwind: v3.4.x with `tailwind.config.js` + `postcss.config.js`.
- Path alias: none was configured for app source imports.
- Existing UI system: custom component set in `src/components/*` with custom CSS tokens in `src/index.css`.
- Existing dependency scan result for common shadcn-adjacent libs:
  - Not present yet: Radix UI packages, `react-hot-toast`, `sonner`, `recharts`, `embla-carousel`, `react-day-picker`, `cmdk`.

## Installed / configured in this phase

- Added shadcn-compatible project config (`components.json`) for JS + Vite + Tailwind v3.
- Added `@` alias to Vite (`@ -> src`) and `jsconfig.json` for editor/import resolution.
- Added shared utility helper:
  - `src/lib/utils.js` with `cn()` (`clsx` + `tailwind-merge`).
- Added dependency foundation:
  - `class-variance-authority`
  - `clsx`
  - `tailwind-merge`
  - `tailwindcss-animate`
  - `sonner`
- Enabled `tailwindcss-animate` plugin in Tailwind config.
- Added base shadcn-style CSS variable bridge in `src/index.css`, mapped to existing ShotScribe tokens to preserve visual language.
- Added starter shadcn-compatible UI location (`src/components/ui/`) with safe additive components:
  - `button.jsx`
  - `card.jsx`
  - `sonner.jsx`

## Suggested first migration targets (lowest risk)

1. Toast layer only (introduce `SonnerToaster` in app shell while preserving existing behavior).
2. Leaf UI controls in isolated panels (buttons, cards, badges, simple alerts) where state logic is already stable.
3. Non-routing overlays that can be wrapped incrementally (tooltip/popover/dropdown) behind existing feature flags or isolated usage points.

## Risky areas to defer for now

- Core editing workspaces (`ShotlistTab`, `ScheduleTab`, `ScriptTab`) with dense drag/drop + keyboard behavior.
- Save/sync status UI and account/admin/auth guard surfaces.
- Modal/dialog flows tied to unsaved changes or cloud sync state transitions.
- Any mobile-specific implementation under `mobile/`.

## Migration policy for next phases

- Replace UI primitives one route/feature at a time.
- Keep existing route structure and feature behavior unchanged.
- Prefer wrapper components that adapt old props to new primitives.
- Only remove legacy UI pieces after feature-level parity QA.

## Phase 1 implementation update (2026-04-02)

Implemented in web app shell and toolbar (no mobile changes):

- Added global Sonner mount in `src/main.jsx`.
- Added shared toast helper (`src/lib/toast.js`) for consistent status messaging.
- Migrated the ephemeral local-only sync guidance from persistent inline toolbar copy to a toast shown when relevant.
- Added shared Radix-based primitives:
  - `src/components/ui/tooltip.jsx`
  - `src/components/ui/dropdown-menu.jsx`
  - `src/components/ui/popover.jsx`
  - `src/components/ui/hover-card.jsx`
  - `src/components/ui/context-menu.jsx`
- Applied low-risk usage in `Toolbar`:
  - export split-button menu now uses shared dropdown primitive
  - project name now supports keyboard-friendly context menu quick actions
  - save/sync control is wrapped with a hover card helper
  - added a lightweight save/sync help popover trigger
  - action/result feedback (cloud enable/save failures/success) now uses toasts instead of blocking alerts in these paths

Still intentionally deferred:
- Replacing dense workflow UIs (Shotlist/Schedule/Script) and existing custom per-entity context menu system.
- Any mobile implementation under `mobile/`.

## Phase 2 implementation update (2026-04-02)

Shared controls and overlay primitives added (web app only):

- `alert`, `alert-dialog`, `drawer`, `checkbox`, `combobox`, `command`, `select`, `slider`, `switch`, `calendar`, and `date-picker` were added under `src/components/ui/`.
- Added required library dependencies (`@radix-ui/react-alert-dialog`, `@radix-ui/react-checkbox`, `@radix-ui/react-dialog`, `@radix-ui/react-select`, `@radix-ui/react-slider`, `@radix-ui/react-switch`, `cmdk`, `react-day-picker`, `vaul`).

Selective low-risk migrations completed:

- Toolbar unsaved-changes confirmation moved from custom modal markup to shared `AlertDialog`.
- Toolbar now includes a reusable command box foundation (`CommandDialog`) with keyboard shortcut (`Ctrl/Cmd+K`) and safe action entries.
- Callsheet configure section visibility toggles now use shared `Checkbox` primitive.
- Save/Sync collaboration role selectors now use shared `Select` primitive.
- Toolbar export-blocked notice now uses shared `Alert` primitive.

Still deferred for later passes:

- Full replacement of date inputs in Callsheet and scheduling flows (needs focused UX/validation pass).
- Broad replacement of all legacy selects/checkboxes across large workflow surfaces (Shotlist/Schedule/Script/Callsheet main tables).
- Wider adoption of Drawer/Combobox/Slider/Switch beyond foundation-level introduction in this phase.

## Phase 3 implementation update (2026-04-02)

Shared presentation foundations added:

- Added `avatar`, `segmented-control`, `chart`, `carousel`, and `sidebar-panel` shared components in `src/components/ui/`.
- Added presentation dependencies for chart/carousel support (`recharts`, `embla-carousel-react`) and avatar primitive (`@radix-ui/react-avatar`).

Selective low-risk adoption completed:

- Added avatars to account identity and cloud-collaboration member rows.
- Adopted shared card wrapper for account status summary while preserving existing card styling.
- Adopted segmented control for admin cloud-write ON/OFF operational toggle.
- Added a lightweight admin overview chart (bar chart) for existing totals to validate chart foundation in a real view.
- Introduced a safe sidebar wrapper (`SidebarPanel`) and applied it to `ConfigureSidebarShell` only.

Sidebar decision (main app shell):

- **Main storyboard/navigation sidebars remain custom for now.**
- Reason: they are tightly coupled to production workflows, keyboard behavior, drag/drop surfaces, and responsive constraints.
- Phase 3 only introduces a compatible wrapper for secondary/config sidebars, so future migration can proceed panel-by-panel without destabilizing the main shell.

Deferred intentionally:

- Broad adoption of carousel (no strong production-use case yet beyond foundation).
- Replacing primary storyboard shell sidebars with shadcn sidebar patterns.
