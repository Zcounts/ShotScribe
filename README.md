# ShotScribe

ShotScribe is a **web-based production planning app for filmmakers**.

It is built to carry a project from **script through production** inside one connected workflow. Instead of breaking prep across separate writing, storyboard, shotlist, schedule, and callsheet tools, ShotScribe keeps that work tied together in one project so the information you create in prep is still useful when you're on set.

The current direction for this repository is **web-first**:

- static web app deployment
- SiteGround hosting target
- local-only browser storage
- import/export for backup and transfer
- mobile-friendly access for use on set

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

## Current product scope

ShotScribe is currently a **static web production planning app**.

That means:

- the browser build is the primary target
- hosting is designed around static deployment
- persistence is local to the browser
- project data can be backed up and transferred through import/export
- there is no backend, account system, or cloud sync in this phase

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

Output folder: `dist-siteground/`

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

## Local-only persistence

Browser mode stores project state locally in the current browser profile.

Important notes:

- clearing browser data can remove local projects
- there is no built-in cross-device sync
- import/export should be used for backup and transfer
- file compatibility should be preserved across ShotScribe project workflows

## SiteGround deployment

1. Build the project with `npm run build:web`
2. Upload the contents of `dist-siteground/` to `public_html/`
3. Make sure `index.html`, `assets/`, and `.htaccess` are included
4. Hard refresh after deployment

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

ShotScribe is actively evolving as a web-first production planning platform for filmmakers.

The current focus is keeping the app **web-safe, portable, and practical**, while preserving a connected workflow from script through production.

## License

Add your preferred license here.
