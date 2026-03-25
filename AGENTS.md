# AGENTS.md

## Repository guidance
- Keep desktop app behavior stable; avoid broad refactors.
- Add new mobile companion work under `/mobile`.
- Add cross-app contracts/utilities under `/shared`.
- Keep incremental, scaffold-first changes small and explicit.

## Build/testing
- Desktop app: `npm run build` at repo root.
- Shared package: `npm install && npm run build` in `/shared`.
- Mobile app: `npm install && npm run build` in `/mobile`.
