# Phase 0 Checklist — Baseline Hardening + Routing Prep

Last updated: 2026-04-01

## Goal

Stabilize current app behavior and add migration scaffolding without changing user-facing workflow.

## Scope checklist

- [x] Add migration phase tracker docs under `docs/migration/`.
- [x] Add runtime environment config loader for future Convex/Stripe/auth variables.
- [x] Add explicit app mode flags (`localOnly`, `cloudEnabled`) defaulting to local-only.
- [x] Add light telemetry/log points for save/open/import/export outcomes.
- [ ] Verify local persistence survives browser refresh.
- [ ] Verify `.shotlist` export/import roundtrip works.
- [ ] Verify `npm run build:web` passes without cloud setup.

## Guardrails

- Do not change Script tab document-first pagination behavior.
- Do not introduce new required env vars for local development.
- Preserve current autosave and recent-project behavior.
