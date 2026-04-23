# Zendesk Sidebar App Implementation Spec

**Status:** Approved implementation direction; sidebar is moving from pilot scaffold to support analyst ADO workspace
**Prepared On:** 2026-04-17  
**Updated On:** 2026-04-23
**Purpose:** Define the concrete package layout, UI states, backend contract, rollout rules, and acceptance criteria for the private Zendesk sidebar app.

## 1. Decision Summary

The Zendesk sidebar app is now a first-class v1 deliverable.

We will:

- build a private Zendesk ticket sidebar app
- start from Zendesk's official React scaffold pattern
- keep the current Node/TypeScript integration service as the backend
- use the sidebar app as the primary agent-facing create/link/status surface
- keep the app visible only on `Musa ADO Form Testing` (`50882600373907`) during development and pilot

We will not:

- ship a native-field-first UX and then replace it later
- build a custom app toolchain from scratch
- force agents to switch to a second ticket form for normal support work

## 2. Concrete Deliverables

This implementation track has two deliverables.

### Deliverable A. App package in the repo

Create a dedicated app package at:

`/Users/musaalsalem/Projects/devazure-zendesk-sync/zendesk-sidebar-app`

The package should:

- build as a standalone Zendesk private app
- use React + Vite + Zendesk Garden
- support local dev with ZCLI
- be installable as a private app in the current Zendesk tenant

### Deliverable B. Production-ready implementation spec

This document is the source of truth for:

- package structure
- visible UX states
- app-to-backend API contract
- rollout and gating rules
- acceptance criteria

## 3. Package Layout

The app package should follow this layout:

```text
zendesk-sidebar-app/
  package.json
  README.md
  .env.development
  .env.production
  vite.config.js
  rollup/
    static-copy-plugin.js
    translations-loader-plugin.js
    modifiers/
      manifest.js
      translations.js
  src/
    index.html
    manifest.json
    translations/
      en.json
    lib/
      i18n.js
    app/
      App.jsx
      index.jsx
      index.css
      config.js
      lib/
        zendesk.js
      hooks/
        useClient.js
        useI18n.js
        useTicketSnapshot.js
      contexts/
        ClientProvider.jsx
        TranslationProvider.jsx
      components/
        ActionScaffold.jsx
        LinkedWorkItemCard.jsx
      locations/
        TicketSideBar.jsx
```

## 4. Current Implementation Scope

The first scaffolded version has been expanded into the pilot implementation.

It now:

- load in `ticket_sidebar`
- register with ZAF
- read ticket context from Zendesk
- call the backend summary endpoint for the authoritative linked-work-item model
- fall back to existing linked ADO values from Zendesk custom fields if the backend summary is unavailable
- hide itself when the ticket is not on the pilot form
- show a useful linked-item summary when an ADO item already exists
- show a useful empty state when no ADO item is linked
- let agents create a new ADO work item through the backend
- let agents link an existing ADO work item by numeric ID or URL through the backend
- let agents unlink an ADO work item from the Zendesk ticket
- show a compact ADO workspace when linked, organized into `Summary`, `Activity`, and `Update`
- enrich the sidebar summary with live ADO work item fields such as title, type, state, owner, area, priority, severity, tags, and changed date
- let agents add a support note to ADO history from Zendesk
- maintain only minimal Zendesk linkage fields; ADO details are fetched live for the app instead of mirrored onto the ticket form

It still does not need to:

- implement save hooks yet
- implement search yet
- expose unrestricted ADO field editing

## 5. Pilot Form Rule

During development and pilot:

- the app is in scope only for `Musa ADO Form Testing`
- Zendesk form ID: `50882600373907`
- if `ticket.form.id !== 50882600373907`, the app should call `client.invoke('hide')`
- if the ticket switches back to the pilot form, the app should call `client.invoke('show')`

This is a hard rule until go-live scope is explicitly widened.

## 6. App State Model

The sidebar app should support these states.

### Hidden state

Condition:

- ticket is not on the pilot form

Behavior:

- app hides itself with ZAF
- no visible fallback UI is required

### Loading state

Condition:

- app is on the pilot form and loading ticket context

Behavior:

- show compact loading indicator
- do not show partial linked-item data

### Empty state

Condition:

- app is on the pilot form
- no linked ADO item exists on the ticket

Visible content:

- ticket reference
- short explanation that no ADO item is linked yet
- scaffold action area for `Create new ADO` and `Link existing ADO`

### Linked state

Condition:

- app is on the pilot form
- ticket has an active `SYNC_LINK` row or the minimal `ADO Work Item ID` fallback field

Visible content:

- work item ID
- open-in-ADO link
- support-friendly status
- status detail
- sprint and ETA when available
- sync health
- last sync timestamp
- unlink action inside the `Update` tab, guarded by inline confirmation

### Error state

Condition:

- ticket context load fails

Behavior:

- show clear agent-safe error text
- do not expose backend implementation details

## 7. Current Field Contract Used By The App

The app should use the backend summary as the authoritative view. The backend reads live ADO data and the `SYNC_LINK` table, then returns a normalized sidebar model.

The only necessary Zendesk ADO custom field for v1 linkage is:

Current field IDs:

| Field | ID |
| --- | --- |
| `ADO Work Item ID` | `50877199973651` |

Legacy ADO mirror fields may still exist globally in Zendesk for backward compatibility and cleanup:

- `Dev Funnel #`
- `ADO Work Item URL`
- `ADO Status`
- `ADO Status Detail`
- `ADO Sprint`
- `ADO Sprint Start`
- `ADO Sprint End`
- `ADO ETA`
- `ADO Sync Health`
- `ADO Last Sync At`

V1 behavior:

- create/link writes `ADO Work Item ID` and clears legacy mirror fields
- unlink clears all ADO linkage and legacy mirror fields
- the app may use `ADO Work Item ID`, `ADO Work Item URL`, or `Dev Funnel #` only as a backend-unavailable fallback
- no redundant ADO field block should be added to the visible Zendesk ticket form

## 8. App Information Architecture

The v1 sidebar should work as a support analyst ADO workspace. The design goal is:

- answer "what is engineering doing?" in under 3 seconds
- let support add high-signal context to ADO without opening ADO
- avoid turning the narrow Zendesk sidebar into a full ADO clone
- keep destructive or workflow-changing ADO updates out of scope until field ownership is approved

The layout should use compact first-screen information and progressive disclosure.

### Header block

Always show:

- app title
- pilot badge or small context note during pilot
- Zendesk ticket ID
- ticket subject

### Linked ADO workspace

When linked, the first visible block should be a compact snapshot:

- ADO work item ID
- ADO title
- support-friendly engineering status pill
- owner / assigned-to
- ETA
- work item type

Below the snapshot, use three tabs:

#### Summary tab

Dense read-only key fields:

- ADO type
- ADO state and reason
- assigned owner
- sprint / iteration
- ETA
- priority
- severity
- area path, compacted to the last useful segments
- product/client/CRF when present
- tags, capped visually

#### Activity tab

Support-facing activity:

- last ADO changed date
- last sync date/source
- current status detail
- sync health
- customer-ready update text that can be copied into a Zendesk reply

Future enhancement:

- newest ADO discussion comments and recent state changes, once the ADO comments/updates API is wired.

#### Update tab

Analyst-safe write actions:

- add a support note to ADO history
- refresh the ADO summary
- unlink ADO from the Zendesk ticket, with confirmation
- open in ADO as an escape hatch

Field-changing actions require business approval before implementation:

- priority/severity updates
- customer impact fields
- escalation flag
- ETA overrides

When not linked, show:

- short empty-state message
- `Create new ADO` action
- `Link existing ADO` input/action

### Action block

Visible when the ticket is not linked.

Contains:

- `Create new ADO` action
- `Link existing ADO` input
- `Link existing ADO` submit action

In functional v1:

- actions are enabled and immediate

## 9. Action Semantics

The app should use **immediate actions**, not save-hook-first actions.

That means:

- clicking `Create new ADO` should immediately call the backend
- clicking `Link existing ADO` should immediately call the backend
- clicking `Unlink ADO` should require confirmation, then immediately call the backend
- the backend should update the link record, minimal Zendesk field state, ADO tag state, and private notes after success

Reason:

- cleaner agent UX
- no second submission step
- better fit for "rare but intentional escalation" workflow

`ticket.save` hooks remain optional for future validation or guardrails, not the primary action model.

## 10. Backend API Contract

These endpoints are implemented for the app integration layer.

### 10.1 Get ticket ADO summary

`GET /app/ado/tickets/:ticketId/summary`

Purpose:

- return the normalized app view model for the ticket

Response shape:

```json
{
  "ok": true,
  "ticketId": 39045,
  "linked": true,
  "workItem": {
    "id": 79741,
    "url": "https://dev.azure.com/jestaisinc/VisionSuite/_workitems/edit/79741",
    "title": "[Zendesk #39045] customer-facing issue",
    "workItemType": "Bug",
    "state": "Active",
    "reason": "Investigating",
    "assignedTo": "Engineering Owner",
    "areaPath": "VisionSuite\\Area\\Support",
    "iterationPath": "VisionSuite\\Sprint 42",
    "priority": 1,
    "severity": "2 - High",
    "product": "Core-Customer Service Portal",
    "client": "Client Name",
    "crf": "CRF-001",
    "bucket": "Support",
    "unplanned": true,
    "tags": ["zendesk", "zendesk:id:39045"],
    "createdAt": "2026-04-17T16:21:54.000Z",
    "changedAt": "2026-04-20T15:22:11.000Z",
    "status": "In Dev Backlog",
    "statusDetail": "In backlog",
    "statusTag": "ado_status_in_dev_backlog",
    "sprint": null,
    "eta": null,
    "syncHealth": "ok",
    "lastSyncAt": "2026-04-17T16:21:54.000Z",
    "lastSyncSource": "ado",
    "customerUpdate": "Engineering status: In backlog. Owner: Engineering Owner."
  }
}
```

### 10.2 Create new ADO item

`POST /app/ado/tickets/:ticketId/create`

Initial request shape:

```json
{
  "source": "zendesk_sidebar_app"
}
```

Initial v1 behavior:

- derive creation data from the current Zendesk ticket and existing routing logic
- create the work item
- write back only the minimal Zendesk linkage field (`ADO Work Item ID`)
- clear legacy mirrored ADO fields from the ticket
- write a private audit note

### 10.3 Link existing ADO item

`POST /app/ado/tickets/:ticketId/link`

Request shape:

```json
{
  "source": "zendesk_sidebar_app",
  "workItemReference": "79741"
}
```

Allowed values for `workItemReference`:

- numeric work item ID
- full Azure DevOps work item URL

Behavior:

- resolve the work item
- tag the ADO item with `zendesk:id:<ticketId>` for dedupe
- create the active `SYNC_LINK` row
- write back only the minimal Zendesk linkage field (`ADO Work Item ID`)
- clear legacy mirrored ADO fields from the ticket
- add private audit note

### 10.4 Unlink ADO item

`POST /app/ado/tickets/:ticketId/unlink`

Request shape:

```json
{
  "source": "zendesk_sidebar_app"
}
```

Behavior:

- validate that the Zendesk ticket has an active ADO link
- remove the `zendesk:id:<ticketId>` tag from the linked ADO work item when present
- deactivate the active `SYNC_LINK` row
- clear `ADO Work Item ID` and all legacy mirrored ADO fields on the Zendesk ticket
- add a private audit note
- return an empty linked state so the app shows create/link actions again

### 10.5 Resync linked item

`POST /app/ado/tickets/:ticketId/resync`

Purpose:

- refresh the link fingerprint/private audit state from the currently linked ADO item

This can be a post-v1.0 action if needed.

### 10.6 Add ADO note from Zendesk

`POST /app/ado/tickets/:ticketId/note`

Request shape:

```json
{
  "source": "zendesk_sidebar_app",
  "note": "Customer confirmed this affects all stores after EOD."
}
```

Behavior:

- validate that the Zendesk ticket has an active ADO link
- append the note to ADO `System.History`
- include the Zendesk ticket reference in the ADO history entry
- write an audit-log row
- return the refreshed summary

This is the first analyst-safe write action because it improves engineering context without changing ADO workflow ownership.

## 11. App To Backend Auth

Current recommended implementation:

- the client-side app calls the backend using `client.request()`
- requests use Zendesk proxying
- requests include a ZAF JWT in the `Authorization` header
- the backend verifies the JWT using a shared secret stored as a secure app setting

This remains the preferred next implementation target because it:

- avoids exposing secrets in the browser
- works with Zendesk's documented request/JWT model
- avoids turning the entire sidebar into a server-rendered app unnecessarily

**Implementation note:** This auth path is now wired and live-validated with signed backend requests.

## 12. Concrete Milestones

### Milestone 1. Scaffold package

Done.

- package exists under `zendesk-sidebar-app/`
- it builds from the repo
- it uses the official Zendesk React scaffold pattern
- it loads ticket context
- it hides itself outside the pilot form
- it shows linked vs empty state from Zendesk fields

### Milestone 2. Summary endpoint integration

Done.

- app calls backend summary endpoint
- backend returns normalized model
- app stops depending on direct field reads for the main view model

### Milestone 3. Create action

Done; live endpoint validation passed on 2026-04-23 with Zendesk #39220 -> ADO #79922.

- `Create new ADO` calls backend
- backend creates ADO item
- minimal Zendesk linkage field and private note update correctly
- app refreshes to linked state

### Milestone 4. Link existing action

Done; live endpoint validation passed on 2026-04-23 with Zendesk #39221 -> ADO #79922.

- ID/URL paste works
- backend resolves existing ADO item
- minimal Zendesk linkage field and note update correctly
- app refreshes to linked state

### Milestone 5. Unlink action and lean field contract

Done when:

- linked tickets expose `Unlink ADO` in the Update tab with confirmation
- backend removes the ADO `zendesk:id:<ticketId>` tag when present
- active `SYNC_LINK` row is deactivated
- `ADO Work Item ID` and legacy mirror fields are cleared from Zendesk
- linked-ticket screen space is reserved for live ADO context, not create/link controls

### Milestone 6. Pilot hardening

Done when:

- refreshed private-app package uploaded after copy/i18n changes
- visual smoke completed in Zendesk on the pilot form
- form gating confirmed in the installed app
- success/error messaging confirmed in the installed app
- action retries and duplicate guards confirmed in the installed app
- rollout beyond pilot form explicitly approved

### Milestone 7. Analyst ADO workspace

Done when:

- linked state uses the compact ADO workspace layout
- summary endpoint returns live ADO title/type/state/owner/priority/severity/area/tags/change metadata
- Activity tab includes current status, last sync, last ADO change, and copyable customer-ready update
- Update tab can append an ADO history note from Zendesk
- Update tab can unlink the ADO item from the Zendesk ticket
- empty state keeps create/link actions focused and does not consume linked-ticket screen space

## 13. Acceptance Criteria For The Sidebar App Started In This Repo

The initial code added in this task should satisfy all of the following:

- The Zendesk app lives in its own package and does not disturb the backend TypeScript build.
- The app package is visibly based on the official Zendesk React scaffold shape.
- The app uses Zendesk Garden, not ad hoc raw HTML buttons/forms alone.
- The app reads the real pilot form ID and the minimal linked field IDs already documented in this project.
- The app self-hides outside `Musa ADO Form Testing`.
- The app shows a linked-item summary if the ticket has an active ADO link.
- The app actions call the backend and refresh after create/link/unlink succeeds.

## 14. Files To Treat As Source Of Truth

- Sidebar implementation spec:
  [ZENDESK-SIDEBAR-APP-IMPLEMENTATION-SPEC.md](./ZENDESK-SIDEBAR-APP-IMPLEMENTATION-SPEC.md)
- Field contract:
  [ZENDESK-ADO-V1-FIELD-DEFINITIONS.md](./ZENDESK-ADO-V1-FIELD-DEFINITIONS.md)
- Current research and leverage choices:
  [2026-04-17-zendesk-sidebar-app-sota-and-knowledge-gap-analysis.md](../reports/2026-04-17-zendesk-sidebar-app-sota-and-knowledge-gap-analysis.md)
- Current backend field IDs:
  [src/zendesk-field-ids.ts](/Users/musaalsalem/Projects/devazure-zendesk-sync/src/zendesk-field-ids.ts:1)

## 15. Immediate Next Build Step

After the 2026-04-23 live endpoint validation, the next step should be:

1. smoke create/link/unlink behind the existing pilot-form gate
2. smoke the Summary, Activity, and Update tabs on ticket `39045`
3. keep direct minimal Zendesk field reads as a fallback until the stable public URL replaces the quick tunnel
4. decide which ADO field-changing actions support is allowed to perform from Zendesk
