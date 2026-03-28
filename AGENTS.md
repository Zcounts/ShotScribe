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

## Script tab
Before editing the Script tab, read:
- `docs/script-tab-spec.md`

## Rules
- The Script tab is a document-first screenplay editor.
- Preserve real paginated pages.
- Do not use a tall infinite canvas.
- Use inches in the UI, not pixels.
- The visual direction is closer to scriptOdd than StudioBinder.
- The interaction model should feel closer to Google Docs / Word for editing, and Final Draft for screenplay element flow.
- Do not redesign ad hoc. Follow the spec.
- Work only on the current phase defined in the spec.
- Prefer small, reversible changes.
- If a requirement changes, update the spec first.
