# ShotScribe Mobile Web App Spec (Scaffold Placeholder)

## Summary
This document defines the initial architecture direction for a separate ShotScribe mobile web companion app.

- Desktop Electron app remains the source of truth.
- Mobile app lives under `/mobile` as a standalone Vite React PWA.
- Shared contracts/schemas/serialization/versioning/crypto helpers live under `/shared`.
- Desktop includes placeholder services for export/publish/import flows.
- Hosted project feed remains optional and deferred.


## Package setup choice
To minimize risk to the existing desktop build and lockfile behavior, this scaffold uses **separate package folders** (`/mobile` and `/shared`) without introducing npm workspaces yet.

## Current scaffold status
- `/mobile`: created with buildable Vite React PWA skeleton.
- `/shared`: created with placeholder TypeScript types, Zod schemas, and utilities.
- `/src/services/mobile`: desktop placeholder service layer added.

## Deferred
- End-to-end feature implementation (import/export UX, offline data sync behavior, hosted feed endpoints, and conflict resolution).
