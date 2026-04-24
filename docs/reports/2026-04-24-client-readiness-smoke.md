# Client Readiness Smoke Test - 2026-04-24

**Purpose:** Validate the live Zendesk-Azure DevOps pilot before handing it to client users for structured testing.

**Environment:**

- Zendesk tenant: `jestaissupport.zendesk.com`
- Pilot form: `Musa ADO Form Testing` (`50882600373907`)
- Backend: `zendesk-ado-sync` on `ubuntu-docker-host`, `SYNC_DRY_RUN=false`
- Sidebar app: `Jesta Azure DevOps Sidebar`, app `1240317`, installation `50988210128019`
- Smoke Zendesk ticket: `39235`
- Smoke ADO work item: `79943`
- Out-of-scope guard ticket: `39236`

## Summary

The scripted readiness smoke passed the core functional, security-scope, attribution, efficiency, and live-sidebar UI checks.

One readback nuance was observed and clarified: Zendesk returns cleared text/integer custom fields as an empty string (`""`) rather than `null`. A follow-up unlink/relink check confirmed the unlink flow does clear the fields, removes the ADO `zendesk:id:<ticketId>` tag, and restores both when relinking.

The authenticated browser gate is complete. The Zendesk sidebar renders the linked ADO workspace, keeps the key details visible in the available screen real estate, exposes the `Unlink ADO` action, and separates read-only status from update actions through `Summary`, `Activity`, and `Update` tabs.

## Functional Matrix

| Check | Result | Evidence |
| --- | --- | --- |
| Create pilot ticket on approved form | Pass | Zendesk ticket `39235` created on form `50882600373907` |
| Backend rejects out-of-scope app route | Pass | Ticket `39236` summary request returned `403` |
| Sidebar summary before create | Pass | Returned `linked:false` |
| Sidebar create ADO item | Pass | `POST /app/ado/tickets/39235/create` returned `201`; ADO `79943` |
| Create internal note attribution | Pass | Zendesk note includes `Performed by: Codex Readiness Agent` |
| ADO dedupe tag on create | Pass | ADO `79943` includes `zendesk:id:39235` |
| Sidebar ADO discussion comment | Pass | Endpoint returned `200`; ADO comment includes `Submitted by: Codex Readiness Agent` |
| Zendesk note for sidebar comment | Pass | Internal note includes action content and actor |
| Zendesk public reply to ADO | Pass | Public reply synced to ADO comment `15902897` |
| Zendesk private `#sync` note and attachment to ADO | Pass | ADO comment created and attachment relation present |
| ADO discussion to Zendesk | Pass | ADO comment synced back to Zendesk internal note `51096444777491` |
| ADO state to Zendesk status | Pass | ADO `Active` mapped to `ado_status_dev_in_progress`, detail `In development` |
| Sidebar unlink | Pass | Endpoint returned `unlinked`; backend summary returned `linked:false` |
| Unlink clears Zendesk ADO fields | Pass after readback clarification | Fields return `""`; follow-up poll confirmed cleared values |
| Unlink removes ADO tag | Pass | ADO tags no longer included `zendesk:id:39235` |
| Unlink internal note attribution | Pass | Internal note includes actor |
| Sidebar link existing | Pass | Endpoint returned `201`; summary linked to ADO `79943` |
| Relink restores ADO tag | Pass | ADO tags include `zendesk:id:39235` again |
| Link internal note attribution | Pass | Internal note includes actor |
| Oracle audit attribution | Pass | At least 4 sidebar audit rows include `Codex Readiness Agent` |

## Timing Snapshot

These are live backend/API timings from the scripted run.

| Operation | Time |
| --- | ---: |
| Create pilot Zendesk ticket | 725 ms |
| Out-of-scope summary rejection | 173 ms |
| Initial app summary | 408 ms |
| Sidebar create ADO | 1,458 ms |
| Sidebar ADO discussion comment | 695 ms |
| Public reply sync to ADO | 10 s / 2 polls |
| Private `#sync` + attachment sync to ADO | 15 s / 3 polls |
| ADO discussion sync to Zendesk | 15 s / 3 polls |
| ADO state sync to Zendesk | 15 s / 3 polls |
| Sidebar unlink | 1,162 ms |
| Summary after unlink | 152 ms |
| Link existing ADO | 1,263 ms |

## Efficiency And Stability

- Production audits remain clean: root and sidebar package both report `0 vulnerabilities`.
- Backend container is healthy and Oracle readiness returns `ok:true`.
- Sidebar/backend mutation routes respond in bounded time under the live tunnel.
- Worker sync jobs completed within expected polling windows.
- Current dead-job list contains one historical unrelated job from 2026-04-17 for an invalid old AreaPath; no new smoke-created dead jobs were observed.
- Live browser console showed one Zendesk/Smooch widget error from `cdn.smooch.io`; no sidebar iframe/runtime error was observed during the app render check.

## Backend Log Signals

Expected smoke activity appeared in backend logs:

- `created ticket=39235 workItem=79943`
- `commented ticket=39235 workItem=79943`
- `comment event ticket=39235 workItem=79943 comment=true attachments=0`
- `comment event ticket=39235 workItem=79943 comment=true attachments=1`
- `sync_ado_state_to_zendesk: fingerprint unchanged ... comments=2`
- `sync_ado_state_to_zendesk: workItem=79943 ticket=39235 status=ado_status_dev_in_progress comments=0`
- `unlinked ticket=39235`
- `linked ticket=39235 workItem=79943`

## Browser UI Gate

Authenticated Zendesk browser inspection completed against the pilot form and linked ADO tickets:

- Ticket `39235` in the in-app browser displayed the linked ADO workspace for work item `79943`.
- The app panel showed the `Pilot form active` badge, ADO status, work-item summary, `Open in Azure DevOps`, and `Unlink ADO`.
- Edge session ticket `39233` was used for a deeper visual tab check: `Summary`, `Activity`, and `Update` all rendered inside the constrained sidebar.
- `Activity` showed the latest sync metadata, recent ADO discussion, and a concise customer-update copy affordance.
- `Update` showed the `Add ADO discussion comment` composer with the action disabled until text is entered.
- No repeated idle mutations appeared in backend logs during browser inspection; reconcile jobs remained no-op for unchanged linked items.

## Client Pilot Recommendation

Proceed to client pilot. Keep the pilot scoped to `Musa ADO Form Testing` until at least two client users complete the scripted create/link/comment/unlink workflow without backend errors or UI confusion.
