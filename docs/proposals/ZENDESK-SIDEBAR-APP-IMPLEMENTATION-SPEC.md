# Zendesk Sidebar App Implementation Spec

**Status:** Approved implementation direction, with scaffold package created and build-validated on 2026-04-20  
**Prepared On:** 2026-04-17  
**Updated On:** 2026-04-20  
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

## 4. Current Scaffold Scope

The first scaffolded version is intentionally limited.

It must:

- load in `ticket_sidebar`
- register with ZAF
- read ticket context from Zendesk
- read the existing linked ADO values from Zendesk custom fields
- hide itself when the ticket is not on the pilot form
- show a useful linked-item summary when an ADO item already exists
- show a useful empty state when no ADO item is linked
- show the planned `Create new ADO` and `Link existing ADO` surface as scaffold-only UI

It does not need to:

- create ADO work items yet
- link existing ADO work items yet
- call new backend endpoints yet
- implement save hooks yet
- implement search yet

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
- ticket already has linked ADO values in Zendesk

Visible content:

- work item ID
- open-in-ADO link
- support-friendly status
- status detail
- sprint and ETA when available
- sync health
- last sync timestamp
- scaffold action area

### Error state

Condition:

- ticket context load fails

Behavior:

- show clear agent-safe error text
- do not expose backend implementation details

## 7. Current Field Contract Used By The App

The scaffold should read the existing Zendesk custom fields directly.

Current field IDs:

| Field | ID |
| --- | --- |
| `Dev Funnel #` | `50847215571859` |
| `ADO Work Item ID` | `50877199973651` |
| `ADO Work Item URL` | `50877235285395` |
| `ADO Status` | `50877228156563` |
| `ADO Status Detail` | `50877235562259` |
| `ADO Sprint` | `50877208001043` |
| `ADO ETA` | `50877235803539` |
| `ADO Sync Health` | `50877218501395` |
| `ADO Last Sync At` | `50877208248211` |

Zendesk app access pattern:

- use `ticket.customField:custom_field_<fieldId>`
- example: `ticket.customField:custom_field_50877199973651`

The scaffold should treat these fields as read-only.

## 8. App Information Architecture

The v1 sidebar should use this structure.

### Header block

Always show:

- app title
- pilot badge or small context note
- Zendesk ticket ID
- ticket subject

### Linked item block

When linked, show:

- `ADO Work Item ID`
- `Open in Azure DevOps`
- `ADO Status`
- `ADO Status Detail`
- `ADO Sprint`
- `ADO ETA`
- `ADO Sync Health`
- `ADO Last Sync At`

When not linked, show:

- short empty-state message

### Action block

Always visible on the pilot form.

Contains:

- `Create new ADO` action
- `Link existing ADO` input
- `Link existing ADO` submit action

In scaffold stage:

- actions may be disabled or marked as not yet wired

In functional v1:

- actions should be enabled and immediate

## 9. Action Semantics

The app should use **immediate actions**, not save-hook-first actions.

That means:

- clicking `Create new ADO` should immediately call the backend
- clicking `Link existing ADO` should immediately call the backend
- the backend should update Zendesk fields and notes after success

Reason:

- cleaner agent UX
- no second submission step
- better fit for "rare but intentional escalation" workflow

`ticket.save` hooks remain optional for future validation or guardrails, not the primary action model.

## 10. Planned Backend API Contract

These endpoints are planned for the app integration layer.

They are not required for the scaffold-only milestone, but the implementation should build toward them.

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
    "status": "In Dev Backlog",
    "statusDetail": "In backlog",
    "sprint": null,
    "eta": null,
    "syncHealth": "ok",
    "lastSyncAt": "2026-04-17T16:21:54.000Z"
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
- write back Zendesk linkage fields
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
- write back all linked ADO fields
- populate `Dev Funnel #`
- add private audit note

### 10.4 Resync linked item

`POST /app/ado/tickets/:ticketId/resync`

Purpose:

- refresh Zendesk fields from the currently linked ADO item

This can be a post-v1.0 action if needed.

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

**Important:** This auth path is part of the implementation spec, but not yet wired in the scaffold package.

## 12. Concrete Milestones

### Milestone 1. Scaffold package

Done when:

- package exists under `zendesk-sidebar-app/`
- it builds from the repo
- it uses the official Zendesk React scaffold pattern
- it loads ticket context
- it hides itself outside the pilot form
- it shows linked vs empty state from Zendesk fields

### Milestone 2. Summary endpoint integration

Done when:

- app calls backend summary endpoint
- backend returns normalized model
- app stops depending on direct field reads for the main view model

### Milestone 3. Create action

Done when:

- `Create new ADO` calls backend
- backend creates ADO item
- Zendesk fields and private note update correctly
- app refreshes to linked state

### Milestone 4. Link existing action

Done when:

- ID/URL paste works
- backend resolves existing ADO item
- Zendesk fields and note update correctly
- app refreshes to linked state

### Milestone 5. Pilot hardening

Done when:

- form gating confirmed
- success/error messaging confirmed
- action retries and duplicate guards confirmed
- rollout beyond pilot form explicitly approved

## 13. Acceptance Criteria For The Scaffold Started In This Repo

The initial code added in this task should satisfy all of the following:

- The Zendesk app lives in its own package and does not disturb the backend TypeScript build.
- The app package is visibly based on the official Zendesk React scaffold shape.
- The app uses Zendesk Garden, not ad hoc raw HTML buttons/forms alone.
- The app reads the real pilot form ID and linked field IDs already documented in this project.
- The app self-hides outside `Musa ADO Form Testing`.
- The app shows a linked-item summary if the ticket already has ADO values.
- The app shows a clear scaffold notice that create/link actions are not wired yet.

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

After the scaffold package lands, the next coding step should be:

1. add the backend summary endpoint
2. wire the sidebar app to that endpoint
3. keep direct Zendesk field reads only as a fallback until the summary endpoint is stable
