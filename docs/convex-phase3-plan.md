# Convex Phase 3 Plan — Strategic Options (Trimmed)

**Last updated:** 2026-04-05  
**Status:** living architecture-options doc (not a changelog).

## Purpose
Document the **next-level** optimization moves after recent low/medium-risk improvements landed.

---

## 1) What is already done (baseline)

- Snapshot-head metadata table and compatibility query landed.
- Metadata-first cloud project list query landed and is used by Home/SaveSync.
- Asset signed-view caching/dedupe landed across storyboard preview surfaces.
- Collaboration typing/solo-mode safety refinements landed.

These changes reduce avoidable churn but do not eliminate core payload/write amplification.

---

## 2) Core remaining architecture pressure

The main pressure is still this pattern:
- frequent cloud save/sync behavior that depends on large snapshot payload writes/reads,
- plus collaborative reactive subscriptions that are still substantial in active sessions.

So Phase 3 should prioritize **data-flow boundaries**, not just more micro-dedupes.

---

## 3) Candidate directions

## Direction A — Metadata-first everywhere practical (low-medium risk)
- Keep expanding metadata-only reads for status/freshness/list contexts.
- Consolidate query ownership at route/provider layer to avoid duplicate subscriptions.
- Tighten visibility-based query gating.

**Expected gain:** moderate, incremental.  
**Risk:** low-medium.

## Direction B — Targeted domain extraction from full snapshot path (medium-high impact)
- Keep snapshots as backup/history.
- Move one hot domain’s active write/read path away from full payload dependence.
- Candidate domain should be selected from fresh measurements (likely storyboard/script-heavy path).

**Expected gain:** potentially high for sustained active editing.  
**Risk:** medium-high.

## Direction C — Operational controls (retention/pruning/limits)
- Introduce explicit snapshot retention policy and health metrics.
- Add guardrails for oversized payload growth and noisy query surfaces.

**Expected gain:** cost containment + stability.  
**Risk:** medium (data-lifecycle mistakes if rushed).

---

## 4) Recommended order

1. Run a short fresh measurement pass on current code (1–2 days data).  
2. If single-user usage is still too high, prioritize **Direction B** for one domain slice.  
3. Run Direction A and C in parallel only where they do not delay B.

---

## 5) Guardrails for execution

- No auth/billing/admin regressions.
- Preserve local-first UX and clear save/sync trust cues.
- Keep collaboration correctness over raw speed.
- Use feature flags + rollback-ready boundaries for any domain extraction.

---

## 6) Definition of success for next phase

- Convex read/write usage drops meaningfully under realistic active-session load.
- No reintroduction of recent regressions (boot crash, typing clobber, build breaks).
- Fewer conflicting docs: audit + next-session brief remain aligned with shipped code.
