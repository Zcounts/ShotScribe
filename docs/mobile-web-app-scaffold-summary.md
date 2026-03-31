# Mobile Companion Scaffold — Implementation Summary

This repository includes the initial scaffolding for the ShotScribe mobile companion.

## Implemented

1. Added `/mobile` as a standalone Vite + React PWA shell with manifest/service worker assets.
2. Added `/shared` for shared mobile contracts, schemas, serializers, and utility helpers.
3. Added desktop export support under `/src/services/mobile/mobileExportService.js` for generating mobile package JSON files from project data.
4. Added scaffold docs under `/docs` for mobile/web integration guidance.

## Scope guardrails for this phase

- Static web hosting target.
- Local-only persistence.
- No backend/cloud publishing scaffolding.
