# ShotScribe

ShotScribe is a desktop preproduction app for filmmakers.

It is built for directors, cinematographers, and 1st ADs who want to move from script to storyboard to shotlist faster, without breaking that workflow across a pile of disconnected tools.

ShotScribe keeps visual planning and production planning connected inside one project, so the work you do in prep stays useful when it is time to shoot.

## What ShotScribe does

ShotScribe is designed to help film teams:

- work with scripts and scenes inside the same prep environment
- build storyboards scene by scene
- turn boards into practical shotlists
- organize cast and crew information
- build shooting schedules
- generate callsheet-ready production info

The core goal is simple:

**Turn a script into a shootable storyboard and shotlist fast.**

## Who it is for

ShotScribe is built primarily for:

- director / cinematographer / 1st AD teams
- narrative shorts
- indie features
- small film crews that want a leaner prep workflow

It is especially useful for productions that need a practical way to connect creative planning with real production documents.

## Why ShotScribe exists

A lot of indie film prep gets split between too many disconnected tools.

The script lives in one place. Storyboards live somewhere else. Shotlists become spreadsheets. Scheduling gets rebuilt later. Callsheet information gets duplicated again.

That process slows teams down and creates drift between documents.

ShotScribe exists to reduce that friction by keeping the major parts of prep connected in one desktop app built specifically for filmmaking.

## Core workflow

ShotScribe is built around a prep workflow that matches how many film teams actually work:

1. Import or build out the script
2. Review and organize scenes
3. Create visual boards for coverage
4. Turn that coverage into a practical shotlist
5. Organize cast, crew, and production details
6. Build schedules and callsheet information from the same project

The point is not just to make documents.

The point is to make prep faster, clearer, and more usable on real productions.

## Main tabs

### Script
Work with screenplay material inside the app and keep it tied to the rest of the project.

### Scenes
Review, sort, and manage scenes in a way that feeds the storyboard and planning workflow.

### Storyboard
Build visual boards scene by scene using a page-based layout designed for film prep.

Use it to:
- organize shots visually
- add reference images
- define shot specs
- reorder coverage
- keep scene-level notes visible

### Shotlist
Convert visual planning into a practical production-facing shotlist.

Use it to:
- track shot numbers
- log lens, movement, equipment, and notes
- group shots by scene
- review coverage in a more AD-friendly format

### Cast/Crew
Track cast and crew information in one place and tie it back to production days.

### Schedule
Plan shooting days and organize scene coverage into a usable production schedule.

### Callsheet
Generate day-based callsheet information from material already living in the project.

## Product philosophy

ShotScribe is not trying to be generic project management software.

It is built to feel filmmaker-native.

That means the app should stay:

- visual
- practical
- fast
- clear
- useful on real productions
- affordable for indie teams

The goal is to help filmmakers prep faster without turning the tool into something bloated, buggy, or overbuilt.

## What makes it different

ShotScribe is centered on the connection between visual planning and practical planning.

Instead of treating storyboards, shotlists, schedules, and callsheets as completely separate documents, ShotScribe keeps them tied together inside one project so changes can carry across the prep workflow more naturally.

It is designed for people who think in shots, scenes, pages, and production days — not generic tasks and business dashboards.

## Project structure

A ShotScribe project can include production planning data such as:

- script content
- scenes
- shots
- storyboard images
- shot specifications
- cast and crew assignments
- scheduled shoot days
- callsheet information

## Development

### Install dependencies
```bash
npm install
```

### Run in development
```bash
npm run electron:dev
```

### Build desktop app
```bash
npm run electron:build
```

### Platform builds
```bash
npm run electron:build:win
npm run electron:build:mac
```

## Tech stack

ShotScribe is built with:

- Electron
- React
- Vite
- Zustand
- Tailwind CSS
- dnd-kit

## Status

ShotScribe is an actively evolving desktop tool built around real-world filmmaking prep and ongoing refinement.

## License

Add your preferred license here.
