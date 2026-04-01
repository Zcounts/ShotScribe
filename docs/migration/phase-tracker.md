# ShotScribe Migration Phase Tracker

Last updated: 2026-04-01

This tracker keeps migration work incremental and reversible while preserving current local-first behavior.

## Phase status

| Phase | Name | Status | Notes |
|---|---|---|---|
| 0 | Baseline hardening + routing prep | In progress | Scaffold-only changes; no workflow changes intended. |
| 1 | Landing/app path split | Not started | `/` landing and `/app` app routing split. |
| 2 | Convex scaffold + auth identity | Not started | Add backend scaffold only; keep local-only mode intact. |
| 3 | Dual persistence model | Not started | Introduce cloud project shape behind mode flags. |
| 4 | Cloud projects + sharing | Not started | Project access control and sharing flows. |
| 5 | Beta-safe script collaboration | Not started | Guardrail-first collaboration model. |
| 6 | Cloud asset storage | Not started | Asset sync/storage for cloud projects. |
| 7 | Stripe billing + entitlement gating | Not started | Plan-based gating and subscription state wiring. |
| 8 | Public beta hardening | Not started | Reliability, monitoring, launch checklist. |

## Operating rules for each phase

1. Keep local-only workflows stable unless a phase explicitly changes them.
2. Introduce flags first, behavior changes second.
3. Keep changes small, testable, and reversible.
4. Update this tracker and phase notes in the same PR that changes phase state.
