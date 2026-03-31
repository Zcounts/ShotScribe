# ShotScribe

ShotScribe is an end-to-end production planning platform for filmmakers.

It is built to take a project from script through prep and into production inside one connected system. Instead of splitting your workflow across separate writing, storyboarding, shotlisting, scheduling, and callsheet tools, ShotScribe keeps those pieces tied together so the work you do in prep is still useful on set.

The current codebase includes the main production planning app and a mobile web companion built for phones, so your team can bring shotlists, storyboards, schedules, and callsheet information to set in a field-friendly format.

## What ShotScribe is built for

ShotScribe is designed for directors, cinematographers, 1st ADs, producers, and lean film teams who want a more practical way to prep and run a shoot.

It is especially useful for:

- narrative shorts
- indie features
- commercial productions
- music videos
- small and midsize crews that want one connected production workspace

## Core idea

ShotScribe is built around a simple goal:

**Go from script to production in one software ecosystem.**

That means keeping creative planning and production logistics connected across the same project instead of rebuilding the same information over and over.

## Main workflow

ShotScribe is designed to support the full production workflow:

1. Import or build the script
2. Review, organize, and manage scenes
3. Build storyboard coverage
4. Turn boards into production-facing shotlists
5. Organize cast and crew
6. Build the shooting schedule
7. Generate callsheet-ready production information
8. Export mobile-ready day packages for use on set

## Main features

### Script
Work with screenplay material inside the same project as the rest of your prep.

### Scenes
Organize scenes, manage metadata, and keep scene structure connected to storyboard and schedule planning.

### Storyboard
Plan coverage visually, attach images, define shot specs, and keep scene-level notes tied to the same project data.

### Shotlist
Turn visual planning into a practical production document with shot details, coverage notes, timing, equipment, and status tracking.

### Cast/Crew
Track cast and crew information in one place so it can stay connected to schedules and callsheets.

### Schedule
Build shoot days, arrange blocks, and map production days against scenes and shots.

### Callsheet
Generate day-based production information from the same project data instead of rebuilding it somewhere else.

## Mobile web companion

ShotScribe includes a mobile web app built for on-set use.

The mobile experience is designed to let you bring production information into the field on a phone-friendly interface, including:

- overview
- schedule
- shotlist
- storyboard references
- callsheet information
- per-project / per-day access

The current mobile workflow is centered on importing exported JSON packages from the main app. Imported projects are stored locally in the browser, making the mobile app useful as an on-set reference tool even when you want a lighter, phone-first workflow.

## Mobile package system

ShotScribe currently supports a shared mobile data contract for moving day-based production data from the main app into the mobile web app.

Supported package formats include:

- `mobile-day-package`
- `mobile-snapshot`

These packages can include:

- project metadata
- shoot day information
- schedule items
- storyboard references
- callsheet data
- shot status context

## What makes ShotScribe different

ShotScribe is built around the connection between visual planning and real production paperwork.

Instead of treating storyboarding, shotlists, schedules, and callsheets as isolated documents, ShotScribe keeps them tied together inside one project so changes carry forward more naturally.

It is designed for filmmakers who think in scenes, shots, shoot days, and production documents — not generic tasks and business dashboards.

## Repository structure

This repository currently contains multiple parts of the ShotScribe ecosystem:

- `src/` — main planning app
- `mobile/` — mobile web companion
- `shared/` — shared mobile contracts, schemas, serializers, and utilities
- `electron/` — desktop shell and native integration
- `docs/` — supporting docs
- `assets/` — icons and design assets

## Tech stack

### Main app
- Electron
- React
- Vite
- Zustand
- Tailwind CSS
- dnd-kit

### Mobile web app
- React
- Vite
- TypeScript

### Shared layer
- Zod for shared data schemas and validation

## Development

### Main app setup
```bash
npm install
npm run electron:dev
```

### Main app build
```bash
npm run electron:build
```

### Platform builds
```bash
npm run electron:build:win
npm run electron:build:mac
```

### Mobile app setup
```bash
cd shared
npm install

cd ../mobile
npm install
npm run dev
```

### Mobile app build
```bash
cd shared
npm run build

cd ../mobile
npm run build
```

## Current status

ShotScribe is actively evolving.

The repository already includes the main planning app, the mobile web companion, shared mobile package contracts, and JSON export/import support for bringing day-based production data onto a phone.

Some hosted publishing and mobile patch/update flows are scaffolded in the codebase but are not fully implemented yet.

## Vision

ShotScribe is being built as a connected filmmaking workflow system.

The long-term vision is simple: one place to prep the project, one clean system to carry that information into production, and a mobile-friendly way to access the right information on set.

## License

Add your preferred license here.


## Web Migration Plan

ShotScribe is currently built as a desktop app using Electron, but the long-term goal is to transition it into a web application. Because the core app already uses a web stack, this is less about rebuilding from scratch and more about carefully separating desktop-specific features from the main application.

### Phase 1: Audit and isolate Electron dependencies
The first step is identifying everything that currently depends on Electron or native desktop APIs. This includes things like opening and saving `.shotlist` files, export behavior, shell actions, and any filesystem access. The goal is to move these features behind a clean abstraction layer so the main React app no longer depends directly on Electron.

### Phase 2: Browser-compatible local save workflow
Before moving to a full cloud-based product, ShotScribe should work in the browser with local-first behavior. That means replacing desktop file handling with browser-friendly equivalents such as local autosave, import/export, and persistent browser storage. The goal in this phase is to preserve the current workflow as much as possible without requiring a backend rewrite on day one.

### Phase 3: Establish web app parity
Once the Electron-specific logic is separated and browser-based saving is working, the next step is reaching feature parity in the browser. The focus here is making sure the existing experience still feels complete and reliable as a web app before introducing larger product changes.

### Phase 4: Introduce backend and cloud persistence
After the browser version is stable, ShotScribe can begin moving from local-only storage to account-based cloud storage. This phase would include user accounts, project persistence, asset storage, autosave/versioning, and the foundation for future multi-device access.

### Phase 5: Web-first cleanup and Electron retirement
Once the browser version is stable and feature-complete, Electron can be phased out. At that point, desktop-only code can be removed, the app structure can be simplified, and ShotScribe can move forward as a fully web-first product.

### Migration approach
The safest path is not to rewrite everything at once. The recommended approach is:

1. Preserve the current desktop version in a stable branch or tagged release.
2. Isolate Electron-specific logic.
3. Get the app working in the browser with local-first save behavior.
4. Add cloud infrastructure only after browser parity is solid.
5. Retire Electron once the web version is proven stable.

This approach reduces risk, protects the current working product, and makes the transition to a web application much more manageable.

## Static web deployment (SiteGround)

ShotScribe can be deployed as a static web app on SiteGround with local-only browser persistence.

### Build for SiteGround

From the repository root:

```bash
npm install
npm run build:siteground
```

This creates a production-ready folder at `dist-siteground/`.

### Upload to SiteGround

1. Open Site Tools → **Site** → **File Manager** (or use FTP/SFTP).
2. Go to your web root (`public_html/` for the main domain).
3. Upload the **contents** of `dist-siteground/` (not the parent folder itself).
4. Confirm `index.html`, `assets/`, and `.htaccess` are present in `public_html/`.
5. Visit your domain and hard-refresh once after deployment.

### Static hosting notes

- The deployment is static-only and requires no backend services.
- `.htaccess` includes an SPA fallback to `index.html` for deep-link refresh safety.
- Browser project data remains local to each device/profile via browser storage.

## Browser limitations (important)

- **Local-only persistence:** project autosave/history stays in that browser profile; clearing browser storage removes local projects.
- **No cross-device sync:** there is currently no account system or cloud sync.
- **File access differences:** in browser mode, save/open uses download/upload workflows instead of desktop file system dialogs.
- **PDF export differences:** desktop-only print-to-PDF integrations are unavailable in pure browser hosting.
