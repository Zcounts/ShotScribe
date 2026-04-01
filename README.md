# ShotScribe

ShotScribe is a **web-based production planning app for filmmakers**.

It is built to carry a project from **script through production** inside one connected workflow. Instead of breaking prep across separate writing, storyboard, shotlist, schedule, and callsheet tools, ShotScribe keeps that work tied together in one project so the information you create in prep is still useful when you're on set.

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

## Product direction

ShotScribe is moving from a **local-first static web app** into a **public beta SaaS workflow**.

### Frontend
- landing page at `/`
- main app at `/app`
- deployed on **Cloudflare Pages**

### Backend
- **Convex** for backend functions, database, and live-sync application state
- **Convex file storage** for cloud assets and uploads
- **Stripe** for subscriptions, discounts, promo codes, and billing workflows

Convex’s official docs position Convex as a reactive database plus backend functions with client libraries, and Convex is “automatically realtime” when using its query functions and client libraries. Convex also supports built-in file storage for uploads and served files. citeturn126328search7turn126328search3turn126328search2

## Pricing / access model

ShotScribe is being designed around two modes:

### Free tier
- local-only projects
- import/export
- no cloud save
- no cloud collaboration
- no cloud asset storage

### Paid cloud tier
- authenticated account
- cloud-backed projects
- shared cloud projects
- live sync across connected users
- cloud asset storage
- subscription-managed access

## Public beta target

The public beta target is not the same as the current repo behavior.

### Public beta goals
- landing page at `/`
- app at `/app`
- free local-only tier remains available
- paid cloud tier unlocks cloud projects
- shared cloud projects for paid users
- live project sync for paid cloud projects
- cloud assets/uploads for paid projects
- subscription billing through Stripe
- internal backend foundation for discounts, promo codes, and future sales workflows

## Script collaboration plan

For public beta, the screenplay portion should support a **beta-safe collaborative model**, not necessarily full Google Docs-style character-by-character multiplayer editing on day one.

That means beta can ship with a combination of:
- cloud save
- presence or awareness
- safe conflict handling
- scene-level or document-level collaboration guardrails
- version history / recoverability patterns

True high-end screenplay multiplayer editing can be added later as a dedicated collaboration layer if needed.

## On-set web workflow

ShotScribe is not just for prep.

With the web app workflow, you can bring production information onto set in a phone-friendly format, including:

- callsheets
- storyboard references
- shotlists
- schedules
- project/day context

That makes ShotScribe useful not only during planning, but during production when the crew actually needs the information.

## Current repo reality

The repository is still in the middle of this transition.

Right now, the current version is still closer to:

- local-first browser persistence
- static deployment assumptions
- SiteGround-oriented build/output behavior
- import/export as the backup and transfer path
- no finished public beta cloud stack yet

This means the repository still needs migration work to reach the public beta target.

## Repository structure

Current key folders:

- `src/` — main web app
- `mobile/` — mobile web companion
- `shared/` — shared contracts, types, and utilities
- `electron/` — legacy desktop shell kept for archive/fallback
- `docs/` — specs and developer notes
- `assets/` — static assets

Target structure will likely expand to include backend and deployment folders such as:

- `convex/` — Convex schema, functions, and backend logic
- `site/` — landing page source if split cleanly from the app
- `docs/migration/` — public beta migration notes and prompts

## Development

### Main web app

```bash
npm install
npm run dev:web
```

### Build web app

```bash
npm run build:web
```

### Optional migration env scaffolding (no local setup required)

The app now includes a runtime config loader for future cloud migration wiring:

- `VITE_ENABLE_CLOUD_FEATURES` (defaults to `false`)
- `VITE_CONVEX_URL` (optional)
- `VITE_STRIPE_PUBLISHABLE_KEY` (optional)
- `VITE_AUTH_ISSUER_URL` (optional)
- `VITE_AUTH_AUDIENCE` (optional)
- `VITE_MONITORING_ENDPOINT` (optional structured log sink for browser events)

If these values are not set, ShotScribe remains in local-only mode by default (`localOnly: true`, `cloudEnabled: false`).

### Operational kill switch (public beta)

Cloud writes can be disabled quickly during an incident by setting Convex operational flag `cloud_writes_enabled=false`.

Example:

```bash
npx convex run ops:setOperationalFlag '{"adminToken":"<OPERATIONAL_ADMIN_TOKEN>","key":"cloud_writes_enabled","enabled":false,"reason":"incident-2026-04-01"}'
```

Re-enable:

```bash
npx convex run ops:setOperationalFlag '{"adminToken":"<OPERATIONAL_ADMIN_TOKEN>","key":"cloud_writes_enabled","enabled":true,"reason":"incident-resolved"}'
```

Operational docs:
- `docs/migration/public-beta-go-live-checklist.md`
- `docs/migration/incident-toggle-and-recovery.md`
- `docs/migration/support-export-restore-runbook.md`

### Preview build locally

```bash
npm run preview:web
```

### Legacy desktop workflow

```bash
npm run electron:dev
npm run build:desktop
```

Use Electron only when desktop packaging behavior is explicitly needed.

## Local-only persistence

Browser mode currently stores project state locally in the current browser profile.

Important notes:

- clearing browser data can remove local projects
- there is no finished built-in cross-device sync in the current version
- import/export should be used for backup and transfer
- file compatibility should be preserved across ShotScribe project workflows

## Deployment direction

### Current
The current repo still reflects older static deployment assumptions.

### Target
The intended production direction is:

- **Cloudflare Pages** serves the frontend
- root path (`/`) serves the landing page
- `/app` serves the actual application
- **Convex** powers the backend and live data layer
- **Stripe** manages paid cloud access

Cloudflare Pages’ free plan currently includes 500 builds per month, custom domains per project, and unlimited static requests/bandwidth for static assets. Convex pricing includes a Starter pay-as-you-go plan and a Professional plan, and Convex offers startup credits/program terms for qualifying companies. citeturn126328search0turn126328search12

## Convex notes

Convex is being chosen because it better matches the long-term product direction for:

- live-updating app state
- backend functions living close to app data
- shared cloud projects
- future collaboration features
- future internal business/admin workflows

Convex supports authentication through JWT/OpenID Connect-compatible providers, and Convex Auth exists as an integrated option, though the official docs currently describe Convex Auth as being in beta. citeturn126328search5turn126328search1

## Product philosophy

ShotScribe is not meant to feel like generic project management software.

It is built to feel native to real film workflows:

- visual
- practical
- fast
- production-focused
- useful in prep and on set
- accessible for indie teams

## Status

ShotScribe is actively evolving from a **local-first web app** into a **cloud-backed collaborative production platform for filmmakers**.

The current build is not yet the final public beta architecture. The immediate focus is migrating safely from the current local/SiteGround-oriented version into a Cloudflare + Convex + Stripe public beta while preserving the existing workflow and maintaining a free local-only tier.
