# ShotScribe Public Beta Rollout Audit

Date: 2026-04-01  
Auditor mode: repo-only implementation audit (no product behavior changes)

Policy centralization follow-up: see `docs/access-policy.md` for the canonical public-beta entitlement/access helper contract and current enforcement wiring.

## Scope and guardrails used for this audit

- Audited current repository behavior against public-beta rollout requirements.
- Focused on: cloud entitlement/billing/sharing/presence/assets/routing/admin/local-only safety.
- Did **not** change runtime behavior in this phase.
- Preserved assumptions:
  - local-only must continue to function
  - app is domain-root on `https://app.shot-scribe.com/`
  - SiteGround manual artifact upload remains deploy path

---

## 1) Current implemented status by feature

Legend:
- ✅ Implemented
- 🟡 Partial / implemented foundation, missing production-complete flow
- ❌ Missing

| Feature area | Status | Evidence in code | Audit notes |
|---|---|---|---|
| Paid cloud access entitlement checks | 🟡 | Convex entitlement checks exist (`requireCloudEntitlement`, `canUseCloudFeatures`) and gate write mutations for projects/snapshots/members/assets. | Backend gating is real, but frontend still has limited UX-level gating/error states and no dedicated account entitlement page.
| Stripe checkout flow | 🟡 | Frontend `BillingActions` triggers `billing:createCheckoutSession`; backend action creates Stripe Checkout subscription session. | Checkout start exists; no robust post-checkout in-app reconciliation UI beyond query-based entitlement refresh.
| Stripe customer portal | ❌ | No `createPortalSession` action/query or frontend entry found. | Must be added for subscription self-management.
| Webhook syncing (Stripe → Convex) | ✅ | HTTP route `/stripe/webhook`, signature verification, event parsing, internal subscription sync mutation. | Core pipeline exists and updates `billingSubscriptions` + account plan tier.
| Shared project collaboration model (ACL) | ✅ | `projects`, `projectMembers`, roles (`owner/editor/viewer`), access-role checks on reads/writes. | Core ACL model exists with owner/member role evaluation.
| Invites | 🟡 | Invite creation/acceptance backend exists (`projectInvites`, token flow); settings UI can invite and manage members. | Accept-invite UI route/page not present in main app flow; invite URL points to `/accept-invite` but no explicit implemented screen in audited frontend files.
| Presence / realtime collaboration awareness | ✅ | Presence heartbeat/list, scene lock acquisition/release, snapshot history integration in Script tab. | Guardrail model exists (presence + lock lease), not full CRDT collaboration.
| Asset upload/storage/access | ✅ | Convex storage upload URL generation, completion records in `projectAssets`, permission-checked asset views, orphan pruning. | Cloud asset pipeline exists and is wired from `ShotCard` + `assetService`.
| Read-only downgrade behavior when paid access lost | 🟡 | Write paths are entitlement-gated in backend. | Explicit product-mode enforcement is incomplete vs requirement: no centralized “downgraded read-only mode” UX; export and cloud asset access blocking in downgrade is not comprehensively wired in frontend.
| Account page | ❌ | Session bar shows auth state + upgrade button only. | No dedicated account/settings page for plan status, billing history, portal, team/collab status.
| Internal admin role + admin tools inside app | ❌ | Ops controls exist as backend mutations requiring `OPERATIONAL_ADMIN_TOKEN`; no app-embedded admin role UI. | Requirement says admin tooling must live inside ShotScribe behind admin role; not yet met.

---

## 2) File-by-file ownership map (what module currently owns what)

### Auth/session/user bootstrap

- `src/config/runtimeConfig.js`
  - app mode flags from env (`VITE_ENABLE_CLOUD_FEATURES`) and Convex/Clerk keys.
- `src/auth/authConfig.js`
  - determines when cloud auth is configured.
- `src/auth/AuthProvider.jsx`
  - mounts Clerk + Convex provider stack, signed-in gate behavior.
- `src/auth/AuthSessionBar.jsx`
  - in-app session indicator, sign-in/out actions, upgrade action mount.
- `convex/users.ts`
  - user upsert/current user profile lookup in Convex.

### Billing status / entitlement

- `convex/schema.ts`
  - `billingSubscriptions`, `accountProfiles`.
- `convex/billing.ts`
  - entitlement computation, checkout action, Stripe subscription sync mutation.
- `convex/webhooks.ts` + `convex/http.ts`
  - Stripe webhook ingestion and routing.
- `src/features/billing/BillingActions.jsx`
  - upgrade CTA and checkout launch.

### Cloud feature flags / operational controls

- `src/config/runtimeConfig.js`
  - frontend cloud mode enablement.
- `convex/ops.ts`
  - operational flag storage and `cloud_writes_enabled` enforcement utility.
- `convex/projects.ts`, `convex/projectSnapshots.ts`, `convex/projectMembers.ts`, `convex/assets.ts`
  - apply `requireCloudWritesEnabled` on cloud writes.

### Project ownership / sharing / collaboration

- `convex/projects.ts`
  - create/list/get cloud projects.
- `convex/projectMembers.ts`
  - roles, invite, accept, revoke, role mutation.
- `src/features/sharing/SharingSettingsSection.jsx`
  - collaborator management UI in Settings.
- `convex/projectSnapshots.ts`
  - snapshot creation/history and optimistic conflict detection.
- `convex/screenplayLocks.ts` + `convex/presence.ts`
  - lock/presence guardrails.
- `src/components/ScriptTab.jsx`
  - presence heartbeats, lock UX, cloud snapshot save/restore hooks.

### Assets

- `convex/assets.ts`
  - upload URLs, asset completion records, access queries, prune orphan assets.
- `src/services/assetService.ts`
  - blob upload and cloud asset metadata shaping.
- `src/components/ShotCard.jsx`
  - cloud upload wiring and cloud asset query for render.

### Ops/admin flags

- `convex/ops.ts`
  - operational flags + diagnostics endpoints.
- `convex/opsLog.ts`
  - operational event persistence/logging helper.

### Routing/domain-root behavior

- `vite.config.js`
  - `base: '/'`, root app build entry.
- `public/_redirects`
  - legacy `/app` redirects to `/`, SPA fallback to root `index.html`.
- `index.html`
  - root app entry mounting `src/main.jsx`.

### Account/settings UI

- `src/components/SettingsPanel.jsx`
  - general settings + embedded sharing section.
- `src/auth/AuthSessionBar.jsx`
  - minimal account/session strip and upgrade action.
- `src/features/billing/BillingActions.jsx`
  - billing CTA only (not full account management).

---

## 3) Missing items list (strictly against rollout requirements)

1. **Stripe customer portal flow**
   - Missing backend action to create billing portal session.
   - Missing frontend entry point from account/settings.

2. **Full downgrade-to-read-only product behavior**
   - Backend blocks writes without entitlement, but required behavior includes:
     - explicit no-edit mode messaging across cloud project surfaces,
     - block export when cloud project is downgraded,
     - block access to cloud-hosted assets under downgrade state.
   - Current code does not show a single authoritative downgrade state machine in frontend.

3. **“Every collaborator must also have paid cloud account” enforcement**
   - Owner-side invite operations are entitlement-gated, but collaborator access enforcement currently depends on each user’s own write attempts/entitlement checks.
   - Need explicit member entitlement policy and handling for non-paid collaborators in shared cloud projects.

4. **Account page (productized)**
   - No dedicated `/account` style surface for subscription status, plan, seat/collab state, billing portal, downgrade notices.

5. **Admin tooling in-app behind admin role**
   - Ops controls currently token-based backend calls; no admin role table/claims enforcement in UI and no embedded admin console.

6. **Invite acceptance app UX path**
   - Backend acceptance mutation exists, but frontend route/screen handling `accept-invite?token=...` is not evident in audited app entry flow.

---

## 4) Recommended implementation order (safest next phases)

1. **Phase A — Audit lock-in + docs alignment (no behavior changes)**
   - Finalize this audit and resolve docs drift so engineers implement against current reality, not historical notes.

2. **Phase B — Account surface foundation (low blast radius)**
   - Add minimal account page/section (plan status, entitlement, subscription state, links).
   - Keep local-only and existing root routing untouched.

3. **Phase C — Stripe customer portal completion**
   - Add backend `createCustomerPortalSession` action.
   - Wire account UI button and safe fallback when unavailable.

4. **Phase D — Canonical entitlement state in frontend**
   - Add one shared entitlement hook/state used by Script/Sharing/Export/Asset access UI.
   - Ensure consistent read-only messaging and control disabling.

5. **Phase E — Downgrade policy enforcement hardening**
   - Enforce required read-only rules explicitly:
     - no edit
     - no export (for cloud projects)
     - no cloud asset access
     - maintain local-only workflows.

6. **Phase F — Collaborator-paid enforcement**
   - Add per-collaborator paid checks and access behavior for shared cloud projects.
   - Decide whether unpaid collaborators are blocked entirely or downgraded viewer with no cloud asset access per product requirement.

7. **Phase G — Invite acceptance UX completion**
   - Implement accept-invite route/screen on root-app deployment shape.
   - Preserve domain-root behavior and current `_redirects` compatibility.

8. **Phase H — Admin role + in-app admin tooling**
   - Add admin role model/claims and protected admin UI section in ShotScribe app.
   - Move operational toggles/diagnostics into that admin surface.

9. **Phase I — E2E beta hardening**
   - Production-like smoke tests for: checkout, webhook sync, invite, multi-user collaboration, downgrade transitions, and incident flag toggles.

---

## 5) After-beta deferrals (recommended)

These can be postponed until after public-beta stabilization:

- Team-seat/advanced billing constructs (multi-seat billing UX, annual/proration complexity).
- Rich admin support tooling beyond minimum required ops dashboard.
- Deep collaboration upgrades (CRDT-level script editing) beyond lock/presence guardrails.
- Broad architecture reshaping of store/UI modules.

---

## 6) Risk list (where accidental breakage is most likely)

1. **Local-only workflow regression risk**
   - Store initialization and project persistence pathways in `src/store.js` + `platformService` are extensive; cloud-mode edits can accidentally affect local autosave/open/import/export.

2. **Routing/domain-root regression risk**
   - Current production intent relies on root app entry and `/app` redirect compatibility.
   - Introducing new routes/pages must not alter `base: '/'` assumptions or break SPA fallback behavior.

3. **SiteGround deploy flow regression risk**
   - Build output contract (`npm run build:web` => `dist-siteground/`) is coupled to manual upload runbook.
   - Changes that alter output structure can break deployment operations.

4. **Cloud feature flag semantics drift**
   - `VITE_ENABLE_CLOUD_FEATURES` and Convex-side `cloud_writes_enabled` have different concerns (frontend mode vs backend write kill switch).
   - Mixed usage without a clear state model can create confusing partial-disable behavior.

5. **Entitlement mismatch between backend and frontend UX**
   - Backend currently blocks writes; frontend may still present editable UX until mutation failure.
   - This can feel broken during downgrade unless proactively surfaced.

6. **Invite acceptance gap risk**
   - Generated invite URLs can exist without a polished acceptance entrypoint, causing support load and failed onboarding.

---

## 7) “Do not break” list for next implementation phases

1. **Do not break local-only mode**
   - Free users must still create/open/save/import/export local projects without cloud env.

2. **Do not change domain-root app behavior**
   - Keep app mounted at root for `app.shot-scribe.com` with current redirect/fallback behavior.

3. **Do not change manual SiteGround deployment flow in this phase**
   - Preserve `build:web` artifact output and runbook compatibility.

4. **Do not bypass existing cloud write safety controls**
   - Keep `requireCloudWritesEnabled` enforcement in all cloud write mutations.

5. **Do not loosen entitlement checks on cloud mutations**
   - Keep `requireCloudEntitlement` enforcement unless superseded by explicit approved policy.

6. **Do not broad-refactor store/script architecture during rollout hardening**
   - Prefer additive, reversible changes localized to billing/account/admin surfaces.

---

## 8) Docs/code mismatches found

1. **Migration phase tracker is outdated vs actual implementation**
   - `docs/migration/phase-tracker.md` marks phases 2–7 as “Not started,” but Convex auth, cloud projects, sharing, presence/locks, assets, and Stripe webhook/billing scaffolding are already in code.

2. **Historical migration plan still contains outdated “no API/model yet” bullets**
   - `docs/migration/public-beta-migration-plan.md` includes historical statements that are now false in current repo state.

3. **README is mostly aligned, but still describes some areas as “partially working” that now have significant concrete backend implementation**
   - The caution is directionally correct, but a few sections understate implemented backend depth and overstate unknowns.

---

## 9) Concrete implementation map for next phases

### Phase 1: Account + portal baseline

- Add account UI module under `src/features/account/` and mount from existing shell.
- Reuse `billing:getMyEntitlement` for status display.
- Add Convex action for Stripe customer portal session.
- Add clear fallback states when billing env vars are missing.

### Phase 2: Unified entitlement/read-only state

- Introduce shared frontend entitlement hook/service (`src/features/billing/useEntitlement.ts` or similar).
- Gate UI actions for cloud edit/export/assets consistently.
- Add downgrade banner and reason messaging in cloud project context.

### Phase 3: Invite acceptance path

- Add minimal route handling for `accept-invite?token=` without changing domain-root behavior.
- Call `projectMembers:acceptProjectInvite`, then open target cloud project.

### Phase 4: Collaborator paid-access enforcement

- Add backend and frontend policy checks for collaborator entitlement.
- Validate role/entitlement interplay for owner/editor/viewer.

### Phase 5: In-app admin tooling

- Add admin role source of truth (profile/claim/table).
- Add admin UI surface inside app for:
  - operational diagnostics
  - cloud write flag toggle
  - entitlement inspection
- Remove dependence on raw token entry in day-to-day operations UI.

### Phase 6: Rollout verification and incident drills

- Run production-like 2-user/2-tier scenarios:
  - free local-only
  - paid cloud owner
  - paid collaborator
  - paid-loss downgrade transitions
  - webhook lag/failure handling
  - operational kill-switch behavior
