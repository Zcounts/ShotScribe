# ShotScribe

ShotScribe is a **static web production planning app** for filmmakers.

Current scope for this repository:

- Web-first app hosted as static files (SiteGround target).
- Local-only persistence in browser storage.
- Import/export of project files for backup and transfer.
- No backend, no account system, no cloud sync.

Electron desktop code is kept as a legacy/archive path so historical workflows can still be built when needed.

## Product scope (current phase)

ShotScribe supports a connected pre-production workflow inside one project:

1. Script
2. Scenes
3. Storyboard
4. Shotlist
5. Cast/Crew
6. Schedule
7. Callsheet

The browser build is the primary target.

## Repository structure

- `src/` — main web app (React + Vite)
- `mobile/` — mobile web companion
- `shared/` — shared contracts/types/utilities
- `electron/` — legacy desktop shell kept for archive/fallback
- `docs/` — specs and developer notes
- `assets/` — static assets

## Development

### Main web app

```bash
npm install
npm run dev:web
```

### Build static web app (SiteGround target)

```bash
npm run build:web
```

Output folder: `dist-siteground/`.

### Preview static web build locally

```bash
npm run preview:web
```

### Legacy Electron workflow (archive/fallback)

```bash
npm run electron:dev
npm run build:desktop
```

Use Electron only when you explicitly need desktop packaging behavior.

## Local-only persistence

Browser mode stores project state locally in the current browser profile.

- Clearing browser data can remove local projects.
- No cross-device sync is included.
- Use project import/export files for manual backup and transfer.

## SiteGround deployment

1. Build: `npm run build:web`
2. Upload contents of `dist-siteground/` to `public_html/`
3. Confirm `index.html`, `assets/`, and `.htaccess` are present
4. Hard refresh after deployment

## Notes

- Keep feature work web-safe first.
- Do not add backend/cloud scaffolding in this phase.
- Preserve file import/export compatibility for existing ShotScribe project files.
