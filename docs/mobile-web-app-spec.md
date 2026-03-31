# ShotScribe Mobile Web App Spec (Current Scaffold)

## Summary
This document defines the architecture direction for the ShotScribe mobile web companion.

- Main app target is static web-first.
- Mobile app lives under `/mobile` as a standalone Vite React PWA.
- Shared contracts/schemas/serialization/versioning/crypto helpers live under `/shared`.
- Main app can export mobile package JSON via `/src/services/mobile/mobileExportService.js`.
- No hosted backend feed is included in this phase.

## Package setup choice
To minimize risk to existing builds and lockfile behavior, mobile/shared remain separate package folders (`/mobile` and `/shared`) without npm workspaces.

## Current scaffold status
- `/mobile`: buildable Vite React PWA shell.
- `/shared`: TypeScript types, Zod schemas, serializers, and helpers.
- `/src/services/mobile`: export-only service for generating mobile package payloads.

## Deferred
- Cloud publish/sync flows.
- Account-based distribution.
- Server-side conflict resolution.
