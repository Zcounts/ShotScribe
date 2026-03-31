# Developer Notes — Web-First Scope

This note defines the current maintenance target for ShotScribe.

## Current target

- Primary runtime: static web app.
- Host target: SiteGround static hosting.
- Persistence: local-only (browser storage + file import/export).
- Backend/cloud features: out of scope.

## Build commands

From repo root:

- Web dev: `npm run dev:web`
- Web build (SiteGround): `npm run build:web`
- Web preview: `npm run preview:web`

Related package builds:

- Shared package: `cd shared && npm run build`
- Mobile app: `cd mobile && npm run build`

## Electron status

Electron remains in `electron/` as a legacy fallback/archive path.

- Do not remove Electron packaging files unless a replacement is fully proven.
- Keep Electron scripts available for historical builds.
- Prioritize web-safe implementations for new changes.

## Data compatibility

- Preserve import/export compatibility for existing project files (`.shotlist` / JSON flows).
- Prefer additive, reversible changes in serialization logic.

## Cleanup policy for this phase

- Remove dead code only when an active browser flow already exists.
- Avoid speculative architecture for future SaaS/backend systems.
- Keep docs synchronized with actual shipping behavior.
