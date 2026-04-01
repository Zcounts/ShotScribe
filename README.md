# ShotScribe

ShotScribe is a **web-based production planning app for filmmakers**.

It is built to carry a project from **script through production** inside one connected workflow. Instead of breaking prep across separate writing, storyboard, shotlist, schedule, and callsheet tools, ShotScribe keeps that work tied together in one project so the information you create in prep is still useful when you're on set.

ShotScribe is moving toward a **web-first SaaS release** built for public beta, with a dedicated landing page at the site root and the application living under `/app`.

## Public site structure

ShotScribe should be deployed with a split between the marketing site and the product:

- `/` — landing page / marketing site
- `/app` — main ShotScribe application
- `/app/*` — all in-app routes, authenticated screens, and future product views

This is an important product and deployment requirement.

The application should **not** assume it lives at the domain root. Any routing, assets, redirects, auth flows, links, or deployment configuration must be safe for an app that runs from `/app` while a separate landing page exists at `/`.

## What ShotScribe does

ShotScribe is designed to support the full production workflow in one place:

1. Script  
2. Scenes  
3. Storyboard  
4. Shotlist  
5. Cast/Crew  
6. Schedule  
7. Callsheet  

The goal is simple:

**Take a film project from script to shoot-ready planning, then bring that information onto set through the web app.**

## Who it is for

ShotScribe is built for filmmakers who need a practical production workflow, including:

- directors
- cinematographers
- 1st ADs
- producers
- indie crews
- narrative shorts
- indie features
- commercial productions
- small and midsize teams that want one connected system

## Why ShotScribe exists

A lot of film prep gets spread across too many disconnected tools.

Scripts live in one place. Storyboards live somewhere else. Shotlists become separate documents. Schedules get rebuilt later. Callsheet details get duplicated again. That creates friction, wasted time, and drift between documents.

ShotScribe exists to keep those moving parts connected.

## Core workflow

ShotScribe is built around a filmmaker-native production workflow:

1. Import or build the script
2. Organize scenes
3. Create storyboard coverage
4. Turn boards into practical shotlists
5. Manage cast and crew details
6. Build the production schedule
7. Generate callsheet-ready day information
8. Bring the project into a phone-friendly web workflow for use on set

## Main features

### Script
Work with screenplay material inside the same project as the rest of your prep.

### Scenes
Manage scene structure, metadata, and scene-level planning that feeds into the rest of the production workflow.

### Storyboard
Plan coverage visually, attach images, define shot specs, and keep storyboards tied to the scenes they belong to.

### Shotlist
Turn visual planning into a practical production document with shot details, notes, and coverage tracking.

### Cast/Crew
Keep production personnel organized in one place so scheduling and day planning stay connected.

### Schedule
Build shoot days and organize production planning around scenes, shots, and day structure.

### Callsheet
Generate day-based production information from the same project data instead of rebuilding it elsewhere.

## On-set web workflow

ShotScribe is not just for prep.

With the web app workflow, you can bring production information onto set in a phone-friendly format, including:

- callsheets
- storyboard references
- shotlists
- schedules
- project/day context

That makes ShotScribe useful not only during planning, but during production when the crew actually needs the information.

## Current product phase

ShotScribe is currently moving toward **Public Beta v0.1**.

The current beta direction is:

- web-first deployment
- landing page at `/`
- main application at `/app`
- browser-first workflow
- local-first project persistence during the current phase
- import/export for backup and transfer
- mobile-friendly access for use on set

At this stage, the repository is still transitioning from an earlier static-hosting setup into a fuller cloud-backed product.

## Target production stack

The long-term production stack is planned around:

- **Firebase Hosting** for web hosting
- **Firebase Authentication** for login
- **Firestore** for cloud project data
- **Cloud Storage** for uploaded files and images
- **Cloud Functions** for backend automation and billing hooks
- **Stripe** for subscription billing

This keeps the product stack focused on two main vendors:

- **Firebase / Google Cloud**
- **Stripe**

## Deployment architecture

The intended deployment model is:

- landing page served at the domain root
- app served from `/app`
- future authenticated app routes nested under `/app/*`
- marketing pages and product app treated as separate surfaces on the same domain

For hosting, production configuration should support:

- a dedicated landing page at `/`
- SPA rewrites for `/app` and `/app/*`
- working deep links inside the application
- asset loading that does not break when the app is mounted under `/app`
- future auth redirects that return users to `/app`

## Important path requirements

Because the app lives at `/app`, the codebase and deployment setup should avoid root-only assumptions.

Important rules:

- app routes should resolve under `/app`
- landing page links should point into `/app`
- asset paths should be relative or `/app`-aware in production
- auth callbacks and redirect URLs should return to `/app`
- deep-linked pages inside the app should still load on refresh
- future billing success/cancel redirects should point to app-safe routes under `/app`
- future mobile-web entry points should not assume the app is served from `/`

If any existing build logic, router config, redirects, or asset references still assume the application lives at the domain root, those should be updated before public beta deployment.

## Repository structure

- `src/` — main web app
- `mobile/` — mobile web companion
- `shared/` — shared contracts, types, and utilities
- `electron/` — legacy desktop shell kept for archive/fallback
- `docs/` — specs and developer notes
- `assets/` — static assets

## Development

### Main web app

```bash
npm install
npm run dev:web
```

### Build static web app

```bash
npm run build:web
```

Current output folder in the existing workflow:

```bash
dist-siteground/
```

That output naming may change as deployment is migrated away from the earlier SiteGround-oriented setup.

### Preview static build locally

```bash
npm run preview:web
```

### Legacy desktop workflow

```bash
npm run electron:dev
npm run build:desktop
```

Use Electron only when desktop packaging behavior is explicitly needed.

## Current persistence model

Browser mode currently stores project state locally in the current browser profile.

Important notes:

- clearing browser data can remove local projects
- there is no built-in cross-device sync in the current phase
- import/export should be used for backup and transfer
- file compatibility should be preserved across ShotScribe project workflows

Cloud sync, authentication, uploaded media storage, and subscription-gated access are planned migration stages rather than fully completed parts of the current beta.

## Migration roadmap

### Stage 1 — Hosting migration
Move the web app away from the current SiteGround-oriented deployment flow and host the product on Firebase Hosting while preserving the landing-page-at-root and app-at-`/app` structure.

### Stage 2 — Login and identity
Add Firebase Authentication so users can create accounts, sign in, recover passwords, and access protected app routes.

### Stage 3 — Cloud project data
Add Firestore-backed project storage so users can access projects across devices instead of relying only on local browser persistence.

### Stage 4 — Uploaded files and images
Add Cloud Storage support for storyboard assets, reference images, and other uploaded project files.

### Stage 5 — Billing and access control
Add Stripe subscriptions and connect billing state to app access through Firebase-backed logic.

### Stage 6 — Public beta hardening
Finalize deployment, security rules, redirects, cloud persistence behavior, and billing flows for a stable public beta release.

## Product philosophy

ShotScribe is not meant to feel like generic project management software.
It is built to feel native to real film workflows.

## Status

ShotScribe is actively evolving as a web-first production planning platform for filmmakers.

The current focus is preparing the app for a public beta transition from a local-first static workflow into a cloud-backed product with login, subscriptions, and a clean split between the landing page at `/` and the application at `/app`.
