# Collaboration Smoke Tests (Public Beta)

Date: 2026-04-01

## Scope
Shared paid cloud projects only. Local-only workflows are explicitly out of scope and must remain unchanged.

## Preconditions
- `owner` account has active paid cloud access.
- `collaborator` account has active paid cloud access (unless a test case revokes it).
- Both users are authenticated in separate browser sessions.
- A cloud project exists with at least one script scene.

---

## 1) Owner + paid collaborator edit same project (LWW beta behavior)

1. Owner invites collaborator as `editor`.
2. Collaborator accepts invite via `/accept-invite?token=...`.
3. Both open the same cloud project.
4. Both edit overlapping script content and save snapshots within a short interval.
5. Verify latest save appears as the current project snapshot.

Expected:
- Invite acceptance succeeds for paid collaborator.
- Presence rows appear for both users.
- Scene lock notices appear when both target the same scene.
- Snapshot saves succeed with `last_write_wins` conflict strategy.
- Last successful snapshot save is the authoritative latest snapshot.

---

## 2) Collaborator loses paid access

1. Start with an existing shared project and active collaborator membership.
2. Change collaborator billing/subscription to inactive/free.
3. Collaborator refreshes app and attempts to open shared project.
4. Collaborator attempts presence heartbeat, lock operations, and snapshot save.

Expected:
- Shared project is no longer listed in collaborator project visibility queries.
- Direct shared project collaboration access is denied for non-owner unpaid collaborator.
- Presence/locks/snapshot writes fail due to project access/entitlement gating.
- Owner can still access project and manage membership.

---

## 3) Invite edge cases

### 3a. Wrong email account
1. Owner invites `userA@example.com`.
2. Sign in as different account (`userB@example.com`) and attempt accept.

Expected:
- Accept fails with email mismatch.

### 3b. Expired invite
1. Create invite and force expiry in data (or wait until expiry).
2. Attempt accept.

Expected:
- Accept fails with invite expired.

### 3c. Repeat accept / refresh accept link
1. Accept a valid invite once.
2. Refresh the same accept URL and accept again.

Expected:
- Accept is idempotent for same user and returns already-accepted success.

---

## 4) Refresh/reconnect behavior

1. Open shared project with two paid collaborators.
2. Stop network temporarily for one user and restore connection.
3. Confirm heartbeat and presence recover within one TTL cycle.
4. Confirm scene locks expire when lock holder disconnects past lease window.

Expected:
- Presence entries naturally expire and repopulate after reconnect heartbeat.
- Expired locks are cleared and can be reacquired.
- No local-only project behavior is affected.

---

## Known beta limitations
- Conflict handling is intentionally last-write-wins (not CRDT).
- Locking is lease-based guardrail, not hard transactional locking.
- Realtime is near-realtime via polling/subscription updates and heartbeats.
