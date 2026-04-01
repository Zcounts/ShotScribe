# ShotScribe

ShotScribe is a **web-based production planning app for filmmakers**.

It is built to carry a project from **script through production** inside one connected workflow. Instead of splitting prep across separate writing, storyboard, shotlist, schedule, and callsheet tools, ShotScribe keeps that work tied together in one project so the information created in prep is still useful when you're on set.

ShotScribe is moving toward a **web-first SaaS release** built around:

- a public landing page at the site root
- the application living under `/app`
- a free local-only tier
- paid cloud features
- shared cloud projects
- live project sync for paid cloud workspaces
- a long-term backend that can support subscriptions, promotions, discounts, and account management
- a collaboration architecture that can grow into true multiplayer screenplay editing after beta

## Public site structure

ShotScribe should be deployed with a split between the marketing site and the product:

- `/` — landing page / marketing site
- `/app` — main ShotScribe application
- `/app/*` — all in-app routes, authenticated screens, shared production views, and future product surfaces

This is a core product and deployment requirement.

The application should **not** assume it lives at the domain root. Any routing, assets, redirects, auth flows, deep links, or deployment configuration must be safe for an app that runs from `/app` while a separate landing page exists at `/`.

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

## Product tiers

ShotScribe is being designed with two core usage modes.

### Free tier
The free tier is intended to carry through beta and public launch.

Free users should be able to:

- create and edit projects locally
- save locally in the browser or local device context
- import/export project files for backup and transfer
- use the app without cloud storage or collaboration

Free tier limits:

- no cloud project sync
- no shared cloud workspaces
- no live collaboration features
- no cloud asset storage
- no paid production workspace features

### Paid cloud tier
The paid tier unlocks ShotScribe's connected production workspace.

Paid users should be able to:

- sign in with an account
- save projects to the cloud
- upload and manage project assets
- collaborate with other users on shared productions
- receive live project updates inside shared projects
- access future cloud-based team and production workspace features

## Collaboration direction

ShotScribe's collaboration strategy is being split into two stages.

### Public beta collaboration target
Public beta should support **shared paid cloud projects** with practical live collaboration features, including:

- cloud-backed shared projects
- project membership and shared access
- live project/module updates for paid cloud users
- presence indicators where useful
- locking or conflict-safe editing patterns for high-risk areas like screenplay editing
- version-aware cloud workflows that reduce overwrite problems

For beta, the script editor does **not** need to behave like Google Docs at the keystroke level.

### Post-beta screenplay collaboration target
True multiplayer screenplay editing is still an important long-term feature.

After beta, the collaboration architecture should be able to grow into:

- character-by-character collaborative script editing
- live cursors and selections
- stronger merge/conflict handling for simultaneous text edits
- a specialized collaborative document layer, likely built around **Yjs + Hocuspocus** or an equivalent dedicated multiplayer text architecture

This means the beta should be designed so the script editor can evolve into true realtime collaboration later without forcing a full rewrite of the app.

## Current product phase

ShotScribe is currently moving toward **Public Beta v0.1**.

The target beta direction is:

- web-first deployment
- landing page at `/`
- main application at `/app`
- browser-first workflow
- free local-only project saving
- paid cloud-backed project saving
- shared paid cloud projects
- live project sync for paid users
- presence and conflict-safe collaboration patterns where needed
- mobile-friendly access for use on set
- account-based access for cloud features
- subscription-gated cloud functionality

At this stage, the repository is still transitioning from an earlier static-hosting, local-first setup into a fuller cloud-backed product.

## Target production stack

The long-term production stack is planned around:

- **Supabase** for backend infrastructure
- **Supabase Postgres** for relational project and account data
- **Supabase Auth** for login and identity
- **Supabase Realtime** for collaborative cloud project updates, presence, and live app sync
- **Supabase Storage** for uploaded files and images
- **Supabase Edge Functions** for secure server-side logic and backend workflows
- **Stripe** for subscription billing, discounts, promo logic, sales workflows, and customer billing
- **Cloudflare Pages** for frontend hosting

Planned post-beta collaboration expansion:

- **Yjs + Hocuspocus** or an equivalent dedicated collaborative text layer for true multiplayer screenplay editing

This keeps the product stack focused on:

- **Supabase** as the primary backend platform
- **Cloudflare Pages** as the frontend host
- **Stripe** as the billing platform
- a future dedicated screenplay-collaboration layer only when the product is ready for true live script editing

## Why this stack

ShotScribe is being optimized for the long term, not only the cheapest short-term launch path.

This stack was chosen because the product is expected to grow into:

- collaborative cloud projects
- shared workspaces
- subscriptions and account management
- discounts and promo handling
- future seat-based or role-based access
- more relational production data over time
- stronger multiplayer screenplay editing after beta

Supabase provides a better long-term fit for a product that is expected to grow beyond single-user local project storage and into collaborative production workspaces.

Cloudflare Pages is the frontend host for the public web layer, with the landing page at `/` and the app mounted at `/app`.

## Deployment architecture

The intended deployment model is:

- landing page served at the domain root
- app served from `/app`
- future authenticated app routes nested under `/app/*`
- marketing pages and product app treated as separate surfaces on the same domain
- frontend deployed to Cloudflare Pages
- backend services handled by Supabase

For production, deployment should support:

- a dedicated landing page at `/`
- SPA rewrites for `/app` and `/app/*`
- working deep links inside the application
- asset loading that does not break when the app is mounted under `/app`
- auth redirects that return users to `/app`
- billing success/cancel flows that return users to app-safe routes under `/app`

## Important path requirements

Because the app lives at `/app`, the codebase and deployment setup must avoid root-only assumptions.

Important rules:

- app routes should resolve under `/app`
- landing page links should point into `/app`
- asset paths should be relative or `/app`-aware in production
- auth callbacks and redirect URLs should return to `/app`
- deep-linked pages inside the app should still load on refresh
- billing success/cancel redirects should point to routes under `/app`
- shared collaboration links should be safe under `/app`
- future mobile-web entry points should not assume the app is served from `/`

If any build logic, router config, redirects, or asset references still assume the application lives at the domain root, those should be updated before public beta deployment.

## Backend and business operations direction

ShotScribe will need backend workflows beyond simple app data.

The backend should be designed to support:

- subscription status and access control
- discounts, promo codes, and sales campaigns
- customer billing management
- internal admin workflows
- support tooling for account/project access issues
- future seat, role, and team-based account logic

This should be handled as part of the long-term SaaS architecture, not as an afterthought layered on top later.

## Repository structure

- `src/` — main web app
- `mobile/` — mobile web companion
- `shared/` — shared contracts, types, and utilities
- `electron/` — legacy desktop shell kept for archive/fallback
- `docs/` — specs and developer notes
