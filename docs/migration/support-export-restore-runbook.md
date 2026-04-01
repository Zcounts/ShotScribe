# Support Runbook: Export/Restore Recovery

Last updated: 2026-04-01

## Scenario

A user cannot access or trust the latest cloud state and needs project recovery from export.

## Inputs required from user

- Most recent `.shotlist`/JSON export file.
- Approximate timestamp of last known-good save.
- Account email and project name.

## Recovery procedure

1. Ask user to keep a copy of original export file unchanged.
2. In app, use **Import Project** and select export file.
3. Confirm core tab data appears:
   - Script
   - Scenes
   - Storyboard
   - Shotlist
   - Schedule
   - Callsheet
4. Ask user to immediately **Save As** a new local backup.
5. If cloud writes are enabled, create a fresh cloud project and save restored state.
6. Verify restored project opens in a second session/device.

## Validation checklist

- [ ] Project opens without parse errors.
- [ ] Scene count and shot count match user expectation.
- [ ] Schedule days/blocks present.
- [ ] Callsheet rows present.
- [ ] Export from restored project succeeds.

## Escalation path

Escalate to engineering if:

- Import parser fails on valid export.
- Data mismatch is reproducible on repeated imports.
- Recovery works locally but cloud sync repeatedly fails after restore.

Include with escalation:

- original export (if user consents)
- restored export
- timestamp + timezone
- screenshots of mismatch
- relevant operational diagnostics output
