# Mobile Companion Scaffold — Implementation Summary

Implemented the initial repository scaffolding for the ShotScribe mobile companion initiative:

1. Added `/mobile` as a standalone Vite + React PWA shell with a manifest and service worker placeholder.
2. Added `/shared` as a reusable package for common types, schema placeholders, serialization helpers, versioning, and crypto utility.
3. Added desktop-side placeholders at `/src/services/mobile` for future mobile package export, publish, and patch import workflows.
4. Added repository-level `AGENTS.md` guidance and scaffold documentation in `/docs`.

No functional behavior changes were made to existing desktop app flows.
