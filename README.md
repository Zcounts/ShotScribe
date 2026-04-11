# ShotScribe

ShotScribe is a filmmaking production planning app in **public beta**.

This monorepo currently contains:
- main web app (`src/`)
- Convex backend (`convex/`)
- mobile companion web app (`mobile/`)
- shared cross-app contracts/utilities (`shared/`)

---

## Current confirmed working state (April 2026)

- `/account` works in production and shows account + billing status.
- `/admin` works in production and loads the internal admin console for admins.
- Real signed-in production admin identity resolves correctly again.
- One-time admin repair flow exists for split/synthetic identity recovery.
- Local-only mode remains supported when cloud auth/env is not configured.
- Current auth/account/admin behavior is intentionally preserved.
- Shotlist and Schedule desktop views collapse secondary side panels at smaller viewports to preserve laptop usability without changing core workflows.
- Shotlist drag-and-drop now preserves each shot's existing SHOT# label (for example, 1A stays 1A) while only changing row order.
- Home tab hero now stays visible for loaded projects and can be edited via Project Properties (title/icon/logline + hero background image + hero overlay color) with local/cloud persistence parity; default no-project headline/subhead are admin-editable with safe fallbacks.
- Home tab left sidebar now supports lightweight expand/collapse toggles for the Cloud Projects and Pending Deletion sections, with session-scoped state that survives tab switches (Cloud defaults expanded, Pending Deletion defaults collapsed) without changing project card behavior.
- Main app responsive header now uses clearer row stacking at narrower widths across tabs (project identity row, actions row, menu/configure row, then tabs) and keeps the legacy Quick actions launcher removed from the main toolbar.
- Schedule tab left sidebar now keeps the Selected Day and Summary accordions visually consistent with the dark sidebar theme (no light background blocks, light-muted text tokens only).
- Storyboard desktop left outline sidebar now stretches to the same full-height content area behavior used by other tabs, eliminating a short sidebar gap when storyboard content is sparse.
- Storyboard tab now uses split scroll ownership on desktop: the outline sidebar and storyboard canvas each keep independent vertical scrolling so scrolling long pages no longer drags the left outline pane.
- Storyboard Project Media Library picker now reliably renders thumbnail previews again (including cached/signed view and existing lightweight preview metadata fallbacks), while gracefully falling back to “No preview” only when no usable preview source exists.
- Callsheet PDF export now uses a higher-contrast professional print layout, suppresses empty sections/rows by default, moves shoot-date/general-call metadata into the footer, and fixes browser fallback printing so `about:blank` no longer appears in generated output.
- Mobile web layout overflow fixes now keep iPhone-width project headers, mode toggles, tabs, and shot cards within viewport bounds without changing desktop/tablet behavior.

---

## Stack (current)

- **Frontend:** React + Vite
- **Backend/data:** Convex
- **Auth:** Clerk + Convex (`convex/react-clerk` on frontend, Convex auth identity on backend)
- **Billing:** Stripe-backed subscription wiring in Convex (checkout/portal session creation + webhook sync)
- **Mobile companion:** React + Vite app in `/mobile` (local mode + cloud project mode)
- **Shared contracts:** TypeScript package in `/shared`

---

## Auth and account/admin model

### Cloud-enabled mode
When `VITE_ENABLE_CLOUD_FEATURES=true` and Clerk/Convex env vars are present:
- frontend wraps app in Clerk + Convex auth providers
- signed-out users are redirected to sign-in for protected cloud routes
- account page (`/account`) reads:
  - Clerk session state
  - canonical Convex current user
  - billing entitlement summary
- admin UI (`/admin`) is gated by `accountProfiles.isAdmin` (not by paid status)

### Local-only mode
When cloud mode/env is absent:
- app still runs in local-only workflows
- `/account` and `/admin` render safe “not configured” states rather than crashing
- no Clerk sign-in requirement is enforced for local workflows

---

## Convex + Clerk integration (current behavior)

- User identity resolution is **canonicalized** server-side.
- Primary match is `tokenIdentifier`; fallback is normalized email when needed.
- Duplicate/split rows are handled conservatively by selecting the most recently updated matching row and preserving profile/admin flags onto canonical profile where applicable.
- Entitlement query (`billing:getMyEntitlement`) is the frontend source for cloud access + admin flag display state.

---

## Billing/Stripe state (realistic)

Implemented now:
- Stripe Checkout session creation
- Stripe Billing Portal session creation
- webhook-driven subscription sync into Convex billing tables
- launch-plan guardrails (entitlement granted only for configured launch `STRIPE_PRICE_ID`)
- account-page reconciliation action after checkout/portal return (`billing:syncMyBillingState`)
- entitlement computation (paid/trialing/manual override/local-only)

Operational reality:
- billing behavior depends on correct Convex + Stripe env configuration
- Convex `action` billing flows must read/write via `ctx.runQuery`/`ctx.runMutation` (internal functions), not direct `ctx.db` access
- Stripe dashboard remains source of truth for promo/coupon operations
- this repo intentionally keeps billing logic conservative and ops-friendly

---

## Production deployment model (high level)

Current production process is still **artifact build + manual hosting upload** for SiteGround-hosted static assets.

High-level flow:
1. Root web app artifact is built in GitHub Actions via `.github/workflows/siteground-static-package.yml` (`npm run build:web`) and uploaded as `shot-scribe-siteground-package.zip`.
2. Team uploads the produced static artifact to SiteGround.
3. Convex backend deploys automatically on pushes to `main` via `.github/workflows/convex-production-deploy.yml` (uses `CONVEX_DEPLOY_KEY`).
4. Mobile app build artifact is generated by `.github/workflows/mobile-web-build.yml` when `mobile/**` or `shared/**` changes.
5. Ensure production env vars are set for Clerk/Stripe/admin token and optional S3 storage.

Reference docs:
- `docs/public-beta-env-setup.md`
- `docs/billing-stripe-runbook.md`
- `docs/admin-role-runbook.md`
- `docs/shadcn-migration-foundation.md` (web-only phased shadcn/ui migration baseline)

---

## Environment notes (current)

Frontend env (root app):
- `VITE_ENABLE_CLOUD_FEATURES`
- `VITE_ENABLE_DRAFT_COMMIT_MODE` (optional, default `false`; enables storyboard local-draft → bounded cloud commit mode)
- `VITE_DRAFT_COMMIT_CHECKPOINT_MINUTES` (optional, default `5`; checkpoint snapshot cadence when draft-commit mode is enabled)
- `VITE_CONVEX_URL`
- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_SENTRY_DSN` (optional; enables Sentry in production builds only)
- `VITE_CLARITY_PROJECT_ID` (optional; enables Microsoft Clarity in production builds only)
- `VITE_APP_ENV` (optional; sent to Sentry as `environment`, for example `production`/`staging`)
- `VITE_APP_RELEASE` (optional; sent to Sentry as `release`, for example git SHA)
- `VITE_MONITORING_ENDPOINT` (optional)
- `VITE_CALLSHEET_PDF_EXPORT_URL` (optional but recommended for polished web callsheet export; points to a serverless endpoint that renders callsheet HTML to a true PDF via headless Chromium)

Mobile frontend env (`mobile/` app):
- `VITE_SENTRY_DSN` (optional; production builds only)
- `VITE_CLARITY_PROJECT_ID` (optional; production builds only)
- `VITE_APP_ENV` (optional)
- `VITE_APP_RELEASE` (optional)

Observability initialization behavior:
- Sentry initializes only when `import.meta.env.PROD === true` and `VITE_SENTRY_DSN` is provided.
- Clarity initializes only when `import.meta.env.PROD === true` and `VITE_CLARITY_PROJECT_ID` is provided.
- Development builds skip both tools to avoid noisy local diagnostics.

Convex query diagnostics safety:
- `src/utils/convexDiagnostics.js` exports both `useConvexQueryDiagnostics` and `useConvexQueryDiagnosticsSafe`.
- UI components should import/use `useConvexQueryDiagnosticsSafe` so diagnostics remain optional and never block app boot if diagnostics wiring changes.

Post-deploy verification (web + mobile):
1. Open the deployed app and confirm a Clarity session appears in the Clarity dashboard.
2. Trigger a controlled client error in browser devtools and verify it appears in Sentry with the expected `environment` and `release`.
3. Confirm no Clarity script requests and no Sentry startup traffic occur in local `npm run dev` sessions unless explicitly configured and built as production.

Callsheet true-PDF export (web):
1. Callsheet export is generated client-side in-browser using `@react-pdf/renderer`, loaded lazily only when export is triggered.
2. Clicking callsheet export downloads a real PDF directly (no browser print dialog).
3. Current callsheet export remains data-driven from schedule + callsheet/cast/crew store state and suppresses empty sections.
4. Browser startup no longer evaluates Node-core specifiers from the callsheet export path (prevents blank-screen crashes like unresolved `events` on initial app load).

Convex env (production as needed):
- `AUTH_ISSUER_URL`
- `AUTH_AUDIENCE`
- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`
- `OPERATIONAL_ADMIN_TOKEN`
- optional invite URL base (`INVITE_URL_BASE` or `CONVEX_INVITE_URL_BASE`)
- `S3_REGION` + `S3_BUCKET` (required for private storyboard cloud image upload/read signing)
- optional `S3_UPLOAD_PREFIX` (defaults to `storyboard`)

---

## Internal admin recovery mini-runbook

### 1) First admin bootstrap (one-time)
Use when there are zero admins:

```bash
npx convex run admin:bootstrapFirstAdmin '{"adminToken":"<OPERATIONAL_ADMIN_TOKEN>","email":"<admin-email>"}'
```

### 2) Repair admin for the currently signed-in real Clerk user
Use when split identity/synthetic rows caused admin mismatch:

```bash
npx convex run admin:repairAdminForCurrentUser '{"adminToken":"<OPERATIONAL_ADMIN_TOKEN>"}'
```

Notes:
- run as the **real Clerk user** session in Convex dashboard function runner (“Act as user”)
- this path is intentionally retained for production safety

### 3) About synthetic/duplicate/no-email rows from prior debugging
- historical manual/debug activity can leave duplicate or synthetic user rows (sometimes no-email)
- treat those rows as **non-canonical noise** unless they are actively mapped to the current Clerk token
- immediate guidance: ignore unless they cause a live auth/admin incident
- if cleanup is needed, perform as a separate explicit maintenance task (not in normal feature work)

---

## Local development / build

### Main web app (root)
```bash
npm install
npm run dev:web
```

### Production web build artifact
```bash
npm run build
npm run build:web
```

- `npm run build` -> standard Vite `dist/`
- `npm run build:web` / `npm run build:siteground` -> SiteGround-targeted output in `dist-siteground/`

Web app favicon source:
- Root web app entry points (`index.html` and `app/index.html`) use `/assets/icon.png`.

### Shared package
```bash
cd shared
npm install
npm run build
```

### Mobile app
```bash
cd mobile
npm install
npm run build
```

---

## Guardrails for stabilization work

- Keep auth/admin/account behavior stable.
- Prefer small, reversible changes.
- Avoid broad routing/auth rewrites during hardening passes.
- If cleanup is risky, defer and document instead of forcing it.
- Most recent conservative housekeeping audit: `docs/repo-cleanup-followup.md`.

---

## Save/sync behavior

- Editing is **local-first** on all surfaces (web, desktop, mobile).
- **Free / local users** stay local-only — no cloud writes, ever.
- **Paid cloud users** edit a local working copy first; cloud snapshot sync is layered on top via a debounced queue (8 s on desktop/web, 6 s on mobile).
- Shot edits on mobile are persisted to localStorage immediately (safe offline), then uploaded to the same Convex project snapshot that desktop reads.
- Toolbar shows a status dot that transitions through: not yet saved → saved on device → uploading (dot pulses) → backed up to cloud / backup failed.
- Desktop/web "Save / Sync Status" dialog now opens in a simplified state with verbose diagnostics collapsed behind a "Show details" toggle.
- Unsaved-change exit guards fire only while local persistence is genuinely pending; they do not block when cloud sync is merely queued.
- Home sidebar (web app) switches from local recents to a cloud project list for signed-in paid users, sorted by latest project update.
- Cloud project deletion is a 24-hour reversible pending state first (`pendingDeleteAt`/`deleteAfter`), then hard-deleted by scheduled Convex reconciliation along with linked cloud project records/assets.
- Cloud snapshot payloads are normalized before Convex writes through one shared transformer (undefined/non-serializable values stripped, duplicate thumbnail fields de-duplicated, and inline `data:`/`blob:`/`file:` image payloads removed so cloud snapshots only store references). This prevents failed first snapshots and zero-snapshot cloud stubs when enabling backup from populated local projects.
- Script-domain snapshot commits now enforce the same cloud snapshot sanitize + size guard as checkpoint writes, so oversized payload failures surface consistently across save paths.
- When local inline storyboard/hero assets are still pending cloud migration, Save/Sync surfaces a specific actionable blocked state (`cloud_blocked_local_assets`) instead of only a generic payload-too-large failure.
- Cloud project lists now hide malformed legacy projects that have no usable snapshot history, so broken historical stubs are not shown as openable projects.
- Full implementation detail + manual QA checklist: `docs/save-sync-architecture.md`.

## Mobile companion modes (April 2026 update)

ShotScribe mobile now supports **two explicit workflows**:

1. **Local File Mode** (no login required)
   - Import `mobile-day-package` / `mobile-snapshot` JSON files.
   - Edit on-set fields on device (shot status, notes, actual timing, script supervisor notes).
   - Export an updated snapshot JSON from mobile after edits.
   - Local edits stay local unless you manually move that exported file elsewhere.

2. **Cloud Project Mode** (paid cloud users)
   - Sign in with the existing Clerk + Convex auth stack.
   - Membership/entitlement is checked via `billing:getMyEntitlement`.
   - Browse accessible cloud projects from `projects:listProjectsForCurrentUser`.
   - Open a cloud project, edit on-set fields, and sync updates back to the same cloud project via snapshot writes.
   - Cloud mode is intended for on-set workflows and collaboration continuity, not full desktop feature parity.

### Mobile UX behavior

- The app header shows the active mode (`Local File Mode` vs `Cloud Project Mode`) at all times.
- A new **Script Supervisor** tab is included in mobile.
- Callsheet remains view-only on mobile.

### Supported mobile edits

- Shot status (`todo`, `done`, `skipped`)
- Shot / production notes
- Script supervisor notes
- Actual start/end timestamps (per shot)

### Sync model

- **Local mode:** file-based, fully offline. Shot edits written to localStorage immediately.
- **Cloud mode:** shot edits written to localStorage first (safe), then debounced cloud snapshot
  write fires ~6 s after the last change. The same Convex snapshot that desktop opens is updated,
  so status changes made on mobile appear on desktop when the project is next opened.
  A sync state banner ("uploading…" / "backed up to cloud · HH:MM" / "cloud backup failed") is
  shown in the app header during cloud mode.

## Script tab inspector (April 2026 update)

- On the Script tab right sidebar, **Script Controls** now groups Estimation, Pagination, and Write options into a single tabbed panel.
- The controls and behavior are unchanged; this is a UI consolidation to reduce inspector clutter while keeping the existing Page & Styles panel untouched.
- Regression fix (April 3, 2026): the Script tab no longer crashes when scenes are created/loaded after mount. Mobile sidebar effects now run unconditionally to preserve React hook order in `ScriptTab`.
- Follow-up UI correction (April 4, 2026): **Page & Styles** now uses a compact icon-led inspector with only `Page` and `Paragraph` tabs (no `All` tab), while preserving existing field behavior/data flow.
- Scene sync fix (April 4, 2026): manual screenplay edits now split screenplay blocks by slugline headings and sync persisted `scriptScenes` so the Scenes tab stays aligned with Script tab sluglines. Import behavior remains unchanged.
- Caret navigation fix (April 6, 2026): in the unified Script editor, `ArrowRight` now moves from a block end to the next block start, and `ArrowLeft` moves from a block start to the previous block end (without changing Enter/Tab/Undo behavior).
- Select-all fix (April 8, 2026): in Script tab write mode, `Ctrl+A` / `Cmd+A` now selects the entire screenplay document across all visible blocks, so copy includes the full script instead of only the active block.
- Multi-block selection fix (April 8, 2026): Script tab write mode now uses a page-level editable surface so drag selection can span multiple screenplay blocks (slugline/action/character/dialogue/parenthetical/transition), and native copy/delete/replace works across block boundaries.

## Launch UX priorities checklist (operator-facing)

Use this checklist when reviewing release candidates to keep product behavior aligned with public-beta priorities:

- Save state is always obvious (clear status text for local saves and cloud sync state).
- Local vs cloud behavior is clearly labeled in editing surfaces and project-level actions.
- Local-first editing remains reliable even when cloud services are unavailable.
- Paid cloud workflows preserve desktop → mobile → desktop continuity without data loss.
- Mobile shot status updates reliably round-trip back to cloud projects and desktop views.

This checklist is intentionally lightweight and release-focused so teams can run quick smoke checks before SiteGround artifact uploads.
