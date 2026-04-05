# Solo Mode / Collaboration Runtime Notes (Trimmed)

**Last updated:** 2026-04-05  
**Scope:** current behavior and limits for collaborator-aware storyboard sync.

## 1) Current implemented behavior (confirmed)

- Solo-mode buffering exists for live storyboard upserts when collaborator presence indicates user is effectively alone.
- Buffered payload flushes on safety triggers (timer, collaborator detected, visibility/page lifecycle triggers).
- No-op suppression remains active to avoid unchanged upserts.
- Remote live apply is deferred while local unsaved/hot text edits are active (`lastStoryboardEditAt` + short hot window).

## 2) Why this remains separate from core audit

This logic has different goals than pure cost optimization:
- protect typing UX and collaboration correctness,
- then reduce unnecessary mutation chatter where safe.

## 3) Current limits

- Presence is still the “alone” signal and can lag briefly.
- Buffer is in-memory (not durable through hard crash/restart).
- Deferred remote apply can add short visibility delay while user is actively typing.

## 4) What this solved vs did not solve

### Solved/helped
- Reduced rare typing clobber/replay edge cases.
- Reduced some solo-session live mutation noise.

### Not a full scaling solution
- Does not address full snapshot payload amplification.
- Does not replace deeper data-model/query-ownership improvements.

## 5) Guardrails for future edits

- Do not trade away text-entry correctness for tiny call-count wins.
- Keep immediate collaborator-join flush behavior intact.
- Keep rollback paths simple and explicit.

## 6) QA anchors

1. Two-user rapid typing: no dropped letters/caret jumps.
2. Solo burst editing: no visible lag/data loss.
3. Collaborator joins mid-edit: buffered changes flush and converge.
4. Save/manual sync semantics unchanged.
