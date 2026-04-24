# Zendesk Sidebar App Implementation Spec

**Status:** Pilot-ready implementation; client-readiness smoke passed
**Prepared On:** 2026-04-17  
**Updated On:** 2026-04-24
**Purpose:** Define the concrete package layout, UI states, backend contract, rollout rules, hardening controls, and acceptance criteria for the private Zendesk sidebar app.

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
        backend.js
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
        WorkItemWorkspace.jsx
      locations/
        TicketSideBar.jsx
  test/
    backend.test.js
    i18n.test.js
    zendesk.test.js
    work-item-workspace.test.js
```

## 4. Current Implementation Scope

The first scaffolded version has been expanded into the pilot implementation and live-smoked in Zendesk.

It now:

- loads in `ticket_sidebar`
- registers with ZAF
- reads ticket context from Zendesk
- calls the backend summary endpoint for the authoritative linked-work-item model
- falls back to existing linked ADO values from Zendesk custom fields only if the backend summary request fails
- hides itself when the ticket is not on the pilot form
- shows a useful linked-item summary when an ADO item already exists
- shows a useful empty state when no ADO item is linked
- lets agents open a compact create form and create a new ADO work item through the backend
- lets agents link an existing ADO work item by numeric ID or URL through the backend
- lets agents unlink an ADO work item from the Zendesk ticket
- shows a compact ADO workspace when linked, organized into `Summary`, `Activity`, and `Update`
- enriches the sidebar summary with live ADO work item fields such as title, type, state, owner, area, priority, severity, tags, and changed date
- shows recent ADO discussion comments in the Activity tab
- lets agents add an ADO discussion comment from Zendesk
- writes an internal Zendesk note for create, link, unlink, and add-comment actions
- maintains only minimal Zendesk linkage fields; ADO details are fetched live for the app instead of mirrored onto the ticket form
- bounds all iframe-to-backend requests with explicit timeouts
- coalesces duplicate refreshes and avoids refreshes while agents type in the ticket subject
- applies action-returned summaries locally after create/link/unlink/comment instead of issuing redundant summary calls
- includes the Zendesk ticket description or first ticket comment in the created ADO description, plus sidebar-entered repro steps, system info, final result, acceptance criteria, and Zendesk submitter

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
- the backend must independently verify the ticket is in the approved form scope before returning ADO data or mutating anything
- the backend allow-list is controlled by `ZENDESK_APP_ALLOWED_FORM_IDS`, defaulting to `50882600373907`
- `ZENDESK_APP_ALLOWED_FORM_IDS=*` is allowed only for explicitly approved wider rollout

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
- ticket has an active `SYNC_LINK` row from the backend summary
- if the backend request fails, the app may use the minimal `ADO Work Item ID` fallback field as a degraded temporary view

Visible content:

- work item ID
- open-in-ADO link
- support-friendly status
- status detail
- sprint and ETA when available
- sync health
- last sync timestamp
- always-visible compact link actions: `Open in Azure DevOps` and `Unlink ADO`
- unlink remains guarded by inline confirmation

### Error state

Condition:

- ticket context load fails

Behavior:

- show clear agent-safe error text
- do not expose backend implementation details

## 7. Current Field Contract Used By The App

The app should use the backend summary as the authoritative view. The backend reads live ADO data and the `SYNC_LINK` table, then returns a normalized sidebar model.

The only strictly required Zendesk ADO custom field for v1 linkage is `ADO Work Item ID`. The pilot also maintains a compact, integration-owned ADO projection so support analysts can scan status without opening ADO or waiting for the next reconciler pass.

Current field IDs:

| Field | ID |
| --- | --- |
| `Dev Funnel #` | `50847215571859` |
| `ADO Work Item ID` | `50877199973651` |
| `ADO Work Item URL` | `50877235285395` |
| `ADO Status` | `50877228156563` |
| `ADO Status Detail` | `50877235562259` |
| `ADO Sprint` | `50877208001043` |
| `ADO Sprint Start` | `50877200183059` |
| `ADO Sprint End` | `50877228323091` |
| `ADO ETA` | `50877235803539` |
| `ADO Sync Health` | `50877218501395` |
| `ADO Last Sync At` | `50877208248211` |

Avoid adding any further redundant ADO fields to the ticket form. These fields are the complete approved support-facing projection for v1:

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

The live `ADO Status` option set must include:

- `ado_status_in_dev_backlog` → `In Dev Backlog`
- `ado_status_scheduled_in_sprint` → `Scheduled In Sprint`
- `ado_status_dev_in_progress` → `Dev In Progress`
- `ado_status_on_hold` → `On Hold`
- `ado_status_support_ready` → `Support Ready`

V1 behavior:

- create/link writes the compact support-facing projection immediately after the ADO work item is created or linked
- background and reverse sync use the same projection helper so create/link/reconciler behavior stays consistent
- unlink clears all ADO linkage/projection fields
- the app may use `ADO Work Item ID`, `ADO Work Item URL`, or `Dev Funnel #` only as a backend-unavailable fallback
- if the backend successfully returns `linked:false`, that response is authoritative and the app must not resurrect stale field data
- no redundant ADO field block should be added to the visible Zendesk ticket form beyond this compact projection

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
- newest human ADO discussion comments, capped for sidebar space, loaded as a degraded/non-blocking enhancement, normalized from ADO HTML to plain text, and filtered to hide integration-generated sync chatter
- customer-ready update text that can be copied into a Zendesk reply

Future enhancement:

- recent ADO state changes, once the ADO updates API is wired.

#### Update tab

Analyst-safe write actions:

- add an ADO discussion comment
- refresh the ADO summary
- link management remains visible above the tabs so agents do not need to hunt for unlink

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
- the backend should update the link record, minimal Zendesk field state, ADO tag state, and internal Zendesk notes after success
- successful action responses should include the next summary model so the sidebar can update locally without a follow-up summary request

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
- write the approved compact Zendesk ADO projection from the created work item
- write a private/internal Zendesk audit note stamped with the acting Zendesk agent
- write an `AUDIT_LOG` summary stamped with the acting Zendesk agent
- return `{ ok: true, action, summary }` so the sidebar can render the linked workspace without a redundant GET

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
- write the approved compact Zendesk ADO projection from the linked work item
- add a private/internal Zendesk audit note stamped with the acting Zendesk agent
- write an `AUDIT_LOG` summary stamped with the acting Zendesk agent
- return `{ ok: true, action, summary }`

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
- mark the link as `unlink_pending` before external side effects
- clear `ADO Work Item ID` and all legacy mirrored ADO fields on the Zendesk ticket
- add a private/internal Zendesk audit note stamped with the acting Zendesk agent in the same Zendesk update when possible
- remove the `zendesk:id:<ticketId>` tag from the linked ADO work item when present
- deactivate the active `SYNC_LINK` row only after Zendesk fields/notes and ADO tag state have succeeded
- if ADO tag removal succeeded but Oracle deactivation fails, attempt to restore the ADO tag and leave the link recoverable
- write an `AUDIT_LOG` summary stamped with the acting Zendesk agent
- return an empty linked state so the app shows create/link actions again

### 10.5 Resync linked item

`POST /app/ado/tickets/:ticketId/resync`

Purpose:

- refresh the link fingerprint/private audit state from the currently linked ADO item

This can be a post-v1.0 action if needed.

### 10.6 Create ADO handoff form

`POST /app/ado/tickets/:ticketId/create`

Request shape:

```json
{
  "source": "zendesk_sidebar_app",
  "handoff": {
    "reproSteps": "1. Open Store Portal\n2. Save order",
    "systemInfo": "Chrome 124, Windows 11, VisionSuite 24.2",
    "finalResults": "Save fails with validation error",
    "acceptanceCriteria": "Order save succeeds without duplicate validation"
  }
}
```

Behavior:

- click `Create new ADO` opens the handoff form instead of immediately creating the work item
- form values are optional but, when present, are written into the structured ADO description
- Zendesk ticket description is included; if unavailable from `tickets.show`, the backend falls back to the first ticket comment
- acting Zendesk agent is stamped as `Zendesk submitter` in the ADO description and remains stamped in Zendesk notes/audit logs

### 10.7 Add ADO discussion comment from Zendesk

`POST /app/ado/tickets/:ticketId/comment`

Request shape:

```json
{
  "source": "zendesk_sidebar_app",
  "comment": "Customer confirmed this affects all stores after EOD."
}
```

Behavior:

- validate that the Zendesk ticket has an active ADO link
- create a Work Item Tracking discussion comment through the Azure DevOps Comments API
- include the Zendesk ticket reference and acting Zendesk agent in the ADO discussion comment
- add a private/internal Zendesk note recording the ADO comment action, acting Zendesk agent, and comment content
- write an audit-log row stamped with the acting Zendesk agent
- return the refreshed summary including recent ADO discussion comments

This is the first analyst-safe write action because it improves engineering context without changing ADO workflow ownership.

### 10.8 Sidebar actor attribution

Every sidebar mutation must be attributable. The frontend resolves `currentUser` through ZAF for create, link, unlink, and ADO discussion-comment actions, then includes this actor in the signed ZAF JWT claims:

- `sub`
- `zendesk_user_id`
- `zendesk_user_name`
- `zendesk_user_email`
- `zendesk_user_role`

The backend must derive sidebar actor identity from verified JWT claims, not from request JSON. The actor should be stamped into:

- ADO discussion comments created from the sidebar
- Zendesk private/internal notes written by sidebar actions
- Oracle `AUDIT_LOG.SUMMARY`

If ZAF cannot provide a current user, the action may proceed but must stamp `Unknown Zendesk agent` so the audit gap is explicit.

Azure DevOps `System.CreatedBy` remains the identity used for the ADO API call unless the future design changes to per-agent ADO OAuth or a privileged bypass-rules create flow. In v1, analyst attribution is preserved through `Zendesk submitter`, ADO discussion/comment text where relevant, Zendesk internal notes, and Oracle audit rows.

### 10.9 Sidebar notification behavior

The sidebar should not promise to write to Zendesk's native profile notification inbox. Zendesk Apps Notify can be used only as a best-effort, real-time event channel for app instances that are currently open.

V1 notification behavior:

- ADO status/comment updates are copied to Zendesk as internal notes.
- ADO status/ETA fields are updated on the Zendesk ticket when mapped values change.
- Zendesk triggers, assignee notifications, and followers remain the durable way to alert agents.
- The Activity tab shows recent human ADO discussion and status context for agents already viewing the ticket.

Optional future enhancement:

- Backend calls Zendesk Apps Notify with an `ado_update_available` event targeted to the ticket assignee when an ADO update arrives. This is enabled only when `ZENDESK_APP_NOTIFY_APP_ID` is configured.
- The open sidebar listens for that event, filters by current ticket ID, shows a compact banner, and refreshes the summary only when the analyst clicks Refresh.
- The same ADO update must still be written to the ticket because Apps Notify is not durable and offline agents may miss it.

## 11. App To Backend Auth

Current implementation:

- the client-side app calls the backend using `client.request()`
- requests use Zendesk proxying
- requests include a ZAF JWT in the `Authorization` header
- the backend verifies the JWT using a shared secret stored as a secure app setting
- sidebar mutations include signed Zendesk actor claims so create/link/unlink/comment actions can be attributed
- the non-secret backend URL comes from normal installation metadata
- the shared secret stays in a secure Zendesk app setting scoped to `jwt_secret_key`
- the app manifest keeps the backend host in `domainWhitelist`
- the backend validates the JWT issuer against the configured Zendesk base URL
- every signed sidebar route still checks server-side ticket form scope before work is done

This remains the preferred path for future Zendesk apps because it:

- avoids exposing secrets in the browser
- works with Zendesk's documented request/JWT model
- avoids turning the entire sidebar into a server-rendered app unnecessarily

**Implementation note:** This auth path is now wired and live-validated with signed backend requests.

## 12. Research-Backed Hardening Template

This section records the hardening work applied after the 2026-04-23 technical, functional, security, efficiency, and UI/UX reviews. Use it as the default checklist for future Zendesk apps.

Research basis:

- [Zendesk Apps Framework best practices](https://developer.zendesk.com/documentation/apps/app-developer-guide/best-practices-for-zendesk-apps-developers/): clean up timers/listeners, cache stable data, avoid unnecessary API calls, use secure settings, define app versions, and avoid console/debugger leftovers.
- [Zendesk `client.request()` contract](https://developer.zendesk.com/api-reference/apps/apps-core-api/client_api/): use the Zendesk proxy for secure settings/JWTs, set explicit `timeout`, and understand `autoRetry` behavior.
- [Zendesk API rate-limit guidance](https://developer.zendesk.com/api-reference/introduction/rate-limits/): reduce request volume, avoid loops, cache where appropriate, and handle `429`/`Retry-After`.
- [Azure DevOps rate-limit guidance](https://learn.microsoft.com/en-us/azure/devops/integrate/concepts/rate-limits?view=azure-devops): honor `Retry-After`, monitor rate-limit headers where useful, and smooth bursts instead of creating retry storms.
- [Azure DevOps Work Item Comments API](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/comments/add-comment?view=azure-devops-rest-7.1): use `POST workItems/{id}/comments` for discussion comments instead of overloading `System.History`.
- [Azure DevOps Work Item Attachments API](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/attachments/create?view=azure-devops-rest-7.1): upload binary content first, then add an `AttachedFile` relation to the work item.
- [Zendesk ticket comments and attachments API](https://developer.zendesk.com/api-reference/ticketing/tickets/ticket_comments/): ticket comments are created through the Tickets API and may include attachment metadata.

### 12.1 Findings addressed

| Finding | Risk | Applied hardening |
| --- | --- | --- |
| Unbounded outbound ADO calls | Slow ADO could hold the backend request open and leave the iframe spinning | Added `AbortSignal.timeout(10_000)` to ADO requests and surfaced `DevAzureTimeoutError` |
| ADO throttling behavior | Immediate retries could worsen rate limiting; long waits could freeze agents | Added one bounded retry for `429/503` only when `Retry-After <= 5s`, with small jitter; long throttles fail fast |
| Unbounded Zendesk backend API calls | Zendesk API slowness could stall sidebar actions | Added a custom `node-zendesk` fetch transport with `AbortSignal.timeout(10_000)` and a matching response adapter |
| Caller-controlled ticket IDs in signed app routes | A valid app JWT could be replayed against an arbitrary ticket ID | Added `assertZendeskTicketAllowedForSidebar()` and `ZENDESK_APP_ALLOWED_FORM_IDS` backend enforcement |
| Authoritative empty backend response ignored | Stale Zendesk fields could display a phantom linked ADO item | Field fallback is now used only when the backend request fails, never after successful `linked:false` |
| Unlink split-brain risk | ADO tag removal before Oracle/Zendesk success could allow duplicate work items | Unlink now marks `unlink_pending`, updates Zendesk first, removes ADO tag, deactivates the link last, and attempts compensation if needed |
| Unlink tag removal could silently miss | ADO update/read timing or patch semantics could leave `zendesk:id:*` on the work item after Zendesk fields were cleared | ADO tag removal now fetches the current revision, uses `replace` for `System.Tags`, retries with verification, and fails the unlink instead of deactivating the link if the tag remains |
| Create/link field projection lag | A newly created or linked work item could leave the visible Zendesk ADO fields blank until a later reconciler pass | Create/link, Zendesk-to-ADO sync, and ADO-to-Zendesk sync now share the compact ADO projection builder and update approved Zendesk fields immediately |
| Live ADO `On Hold` state collapsed to backlog | Support agents could not tell the difference between unplanned work and paused engineering work | Added `On Hold` as a first-class support status and Zendesk dropdown option |
| Sidebar-create routing used inactive product field | New ADO items could be routed through the default path because the sidebar read inactive `Product ORIG` instead of live `Product*` | Sidebar ticket-to-event mapping now reads active `Product*` and `Org Name` field IDs from the pilot form |
| Free-text Zendesk org sent to ADO client picklist | ADO create/update could fail when Zendesk `Org Name` did not exactly match an allowed `Custom.Client` value | `Org Name` is preserved in the ADO description, and `Custom.Client` is written only for approved ADO client values |
| ADO discussion hidden from support | Sidebar-added ADO context could be present in ADO but invisible in Zendesk, forcing agents back into ADO to confirm it | Summary now includes the newest ADO discussion comments and the Activity tab renders them compactly |
| Raw ADO HTML or sync chatter visible in Activity and notes | ADO comments can arrive as HTML fragments, and integration comments can crowd out useful developer updates or leak into Zendesk internal notes | Recent ADO activity and ADO-to-Zendesk discussion notes share a plain-text normalizer, fetch a deeper window, filter integration-generated sync messages, and return/write only display-ready human discussion |
| ADO note used history instead of comments | Writing `System.History` made sidebar/background sync updates look like discussion entries rather than normal field history | Sidebar update action now uses the Azure DevOps Work Item Comments API, routine field sync no longer writes `System.History` chatter, and Zendesk/Oracle audit records preserve traceability |
| Sidebar actions lacked visible actor attribution | Support leads could see that the integration changed ADO/Zendesk but not which analyst used the sidebar action | Mutation requests now include signed ZAF current-user claims; ADO discussions, Zendesk internal notes, and Oracle audit summaries stamp the acting Zendesk agent |
| BRD sprint-assigned status mismatch | Sprint-assigned ADO items could appear merely scheduled when the BRD expects `Dev In Progress` | Status derivation now maps any dated sprint assignment to `Dev In Progress` unless completion or on-hold state wins |
| Explicit ADO target date absent from ETA | Zendesk ETA could only reflect sprint end, not a board-specific delivery target | `DEVAZURE_TARGET_DATE_FIELD` is read from ADO and wins over sprint finish for `ADO ETA` |
| ADO discussions not mirrored as Zendesk notes | Agents could see recent comments in the sidebar but lose durable ticket history | Recent non-integration ADO comments are deduped through `COMMENT_SYNC_MAP` and copied to Zendesk as internal notes |
| Zendesk comment sync could leak private notes | Private troubleshooting notes should not sync unless explicitly selected | Public replies sync to ADO; private notes sync only when tagged `#sync`; integration markers prevent loops |
| Global Zendesk comment events could create background load | `ticket.comment_added` subscriptions can be high-volume, and out-of-scope forms should not enqueue jobs or touch ADO | The webhook receiver now applies the same approved-form allow-list before dedup/enqueue; out-of-scope events return `202 skipped_out_of_scope` |
| Unlinked comment events could cause ADO lookup fan-out | Every unlinked comment could otherwise run a WIQL tag lookup against ADO | `ticket.comment_added` processing now requires an active `SYNC_LINK` row and returns no-op without an ADO lookup when no link exists |
| Comment trigger JSON could break on long text or attachments | Liquid placeholders can produce brittle JSON when comments contain quotes, line breaks, or files | The comment trigger sends a compact event and the worker hydrates the latest comment/attachment payload from Zendesk's Comments API before syncing |
| Zendesk screenshots/logs absent from ADO | Developers could still miss supporting files from the ticket | Zendesk comment attachments are size-guarded, uploaded through the ADO Attachments API, linked to the work item, and deduped through `ATTACHMENT_SYNC_MAP` |
| Attachment download URLs could be abused | A crafted attachment URL could leak credentials or make the backend fetch non-Zendesk hosts | Attachment downloads are restricted to HTTPS Zendesk tenant URLs or Zendesk content CDN (`*.zdusercontent.com`); redirects are followed manually with the same allow-list and auth is sent only to the tenant host |
| Failed jobs had no operator retry surface | Recovery required direct database access | Added token-protected `GET /internal/jobs/dead` and `POST /internal/jobs/:id/retry` operator endpoints |
| Auth failures retried like transient errors | Expired credentials could waste retries and hide urgent action | `401/403` jobs move directly to `DEAD` and can send a configured admin alert webhook |
| Redundant post-action summary calls | Create/link/unlink/comment could double backend/ADO load | Action responses return `summary`; the sidebar applies it locally |
| Refresh fan-out from ticket subject edits | Typing in the Zendesk subject could trigger avoidable backend refreshes | Removed `ticket.subject.changed` subscription; only form and displayed ADO fields trigger refresh |
| Concurrent refresh overlap | Multiple change events could create parallel summary requests | Added in-flight refresh coalescing and a short debounce |
| Backend URL placeholder not substituted | Using `{{setting.backendBaseUrl}}` directly in a signed request URL could resolve as a Zendesk-relative path and bypass the backend | Resolve `backendBaseUrl` from `client.metadata()`, keep only the signing secret as a secure placeholder, and send `Authorization: Bearer {{jwt.token}}` with ZAF JWT options |
| Sidebar popup/iframe height glitches | App could appear blank or partially rendered after activation | Added manifest initial height and resize on mount, activation, and debounced window resize with cleanup |
| Timer/listener leaks | Zendesk app lifecycle changes could leave stale timers/listeners | Resize timers, copy timers, and ticket-change listeners are now cleared on unmount |
| Clipboard false success | Browser/Zendesk iframe clipboard failures could mislead agents | Clipboard API availability and write failures now produce accurate feedback |
| Incomplete tab accessibility | Keyboard and screen-reader users could get poor tab behavior | Implemented roving tab index, arrow/Home/End keys, `aria-controls`, and labelled tab panels |
| Stale/dead linked-card component | Superseded UI code could be accidentally reused | Removed `LinkedWorkItemCard.jsx` and stale translation keys |
| Production dependency audit finding | `node-cron@3` advisory through pinned dependency | Upgraded `node-cron` to 4.x and removed the obsolete local type shim |
| Webhook signing secret printed by default | Setup logs could leak a production signing secret | Registration script now redacts by default and requires `--print-secret` opt-in |
| Stale job recovery unhandled rejection | Oracle outage could produce noisy process-level failures | Wrapped stale-job cron in guarded logging, matching reconciler behavior |

### 12.2 Required controls for future Zendesk apps

Frontend/ZAF controls:

- Use secure Zendesk app settings for secrets; never bundle tokens into iframe JavaScript.
- Use `client.request({ secure: true, cors: false })` for signed backend calls.
- For user-attributed actions, put the ZAF `currentUser` identity into signed JWT claims and have the backend trust only verified claims, not editable JSON body fields.
- Resolve non-secret backend base URLs from `client.metadata().settings`; reserve `{{setting.*}}` placeholders for secure values used by the Zendesk proxy.
- Send ZAF JWTs with `headers.Authorization = "Bearer {{jwt.token}}"` and `jwt.secret_key = "{{setting.sharedSecret}}"`.
- Set explicit `timeout` values on all app-to-backend requests.
- Prefer action responses that include the next view model instead of issuing immediate follow-up GETs.
- Subscribe only to fields that can change the rendered state; avoid noisy text-entry events.
- Debounce and coalesce refreshes so multiple ZAF events collapse into one backend request.
- Hide out-of-scope locations early and avoid backend calls outside the approved scope.
- Clean up all timers and event listeners on unmount or Zendesk lifecycle teardown.
- Keep sidebar bundles small and defer non-current locations with lazy loading.

Backend controls:

- Verify ZAF JWT signature and issuer on every app route.
- Enforce ticket scope server-side; UI hiding is never an authorization boundary.
- Validate route params and request bodies before calling external systems.
- Bound all outbound Zendesk and ADO calls with deadlines.
- Handle `429` and `Retry-After` deliberately; never allow an iframe action to wait for long throttles.
- Make cross-system workflows durable or compensating before touching dedupe markers.
- Keep actions idempotent where possible and return recoverable conflict/error messages.
- Use one Zendesk update for related field changes and private notes to reduce rate-limit consumption.
- Redact secrets in scripts and logs by default.

UI/UX controls:

- Design for the narrow sidebar: compact summary first, progressive details in tabs.
- Put create/link actions only in empty state; reserve linked state for ADO context and analyst-safe updates.
- Require confirmation for unlink/destructive actions.
- Prefer Zendesk Garden components for buttons, forms, messages, and loading states.
- Provide keyboard semantics for custom tabs and focus-visible styling for custom interactive elements.
- Use live regions for async success/error messages.
- Guard long text with wrapping, truncation, or capped tags so it cannot break the iframe layout.
- Keep fallback copy agent-safe and actionable; do not expose stack traces or backend internals.

Operational controls:

- Production audit must show `0 vulnerabilities` for root and sidebar package before packaging.
- Build output should be reviewed for sidebar chunk size and unexpected growth.
- A live Zendesk smoke test must observe request count, request duration, iframe resize, action success/error states, and backend logs before rollout.
- The app must remain pilot-form gated until business approval widens the allow-list.

### 12.3 Current verification baseline

The hardening pass is considered locally verified when these commands pass:

```bash
npm test
npm --prefix zendesk-sidebar-app test
npm run app:build
npm audit --omit=dev
npm --prefix zendesk-sidebar-app audit --omit=dev
git diff --check
```

Latest local and live result on 2026-04-24:

- root test suite: 77 tests, 70 passing, 7 skipped
- sidebar Vitest suite: 14 passing
- sidebar production build succeeds; `TicketSideBar.js` is about `84.06 kB` / `24.65 kB gzip`
- root and sidebar production audits report `0 vulnerabilities`
- live signed/API smoke passed create, link, unlink, sidebar ADO discussion comment, Zendesk public reply sync, private `#sync` attachment sync, ADO discussion back-sync, ADO state back-sync, out-of-scope route rejection, and actor attribution
- authenticated browser UI smoke confirmed the linked workspace, `Unlink ADO`, `Summary`, `Activity`, and `Update` tabs render in Zendesk

## 13. Concrete Milestones

### Milestone 1. Scaffold package

Done.

- package exists under `zendesk-sidebar-app/`
- it builds from the repo
- it uses the official Zendesk React scaffold pattern
- it loads ticket context
- it hides itself outside the pilot form
- it shows linked vs empty state from the backend summary, with Zendesk field fallback only on backend failure

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
- app applies the returned summary and moves to linked state without a redundant GET

### Milestone 4. Link existing action

Done; live endpoint validation passed on 2026-04-23 with Zendesk #39221 -> ADO #79922.

- ID/URL paste works
- backend resolves existing ADO item
- minimal Zendesk linkage field and note update correctly
- app applies the returned summary and moves to linked state without a redundant GET

### Milestone 5. Unlink action and lean field contract

Done.

- linked tickets expose `Unlink ADO` in the always-visible link action row with confirmation
- backend marks unlink pending before external side effects
- `ADO Work Item ID` and legacy mirror fields are cleared from Zendesk
- backend removes the ADO `zendesk:id:<ticketId>` tag when present
- active `SYNC_LINK` row is deactivated last
- failed unlink paths remain recoverable or compensating
- linked-ticket screen space is reserved for live ADO context, not create/link controls

### Milestone 6. Pilot hardening

Done.

- signed backend routes are scoped by server-side ticket form checks
- outbound ADO and Zendesk calls have explicit deadlines
- ADO short throttles are retried once; long throttles fail fast
- sidebar requests are timed out and do not auto-retry inside ZAF
- action responses update the view locally without redundant summary GETs
- refreshes are debounced/coalesced and noisy subject-edit subscriptions are removed
- timers/listeners are cleaned up
- clipboard, tabs, live messages, and overflow behavior pass the local UI standards pass
- production audits are clean

Still required before wider rollout:

- stable public backend URL cutover from the temporary Cloudflare quick tunnel
- repeat smoke after the stable URL swap
- controlled pilot completion by at least two support analysts
- rollout beyond pilot form explicitly approved

### Milestone 7. Analyst ADO workspace

Done.

- linked state uses the compact ADO workspace layout
- empty-state create uses a compact handoff form before creating ADO
- summary endpoint returns live ADO title/type/state/owner/priority/severity/area/tags/change metadata and display-ready recent human discussion comments
- Activity tab includes current status, last sync, last ADO change, cleaned recent ADO discussion, and copyable customer-ready update
- Update tab can append an ADO discussion comment from Zendesk
- linked workspace can unlink the ADO item from the Zendesk ticket without hiding the action inside a tab
- empty state keeps create/link actions focused and does not consume linked-ticket screen space

## 14. Acceptance Criteria For The Sidebar App Started In This Repo

The current implementation should satisfy all of the following:

- The Zendesk app lives in its own package and does not disturb the backend TypeScript build.
- The app package is visibly based on the official Zendesk React scaffold shape.
- The app uses Zendesk Garden, not ad hoc raw HTML buttons/forms alone.
- The app reads the real pilot form ID and the minimal linked field IDs already documented in this project.
- The app self-hides outside `Musa ADO Form Testing`.
- The app shows a linked-item summary if the ticket has an active ADO link.
- The create action opens the ADO handoff form and sends repro steps/system info/final result/acceptance criteria to the backend.
- The app actions call the backend and apply returned summaries after create/link/unlink/comment succeeds.
- The backend independently verifies ticket form scope for every signed app route.
- All app-to-backend, backend-to-Zendesk, and backend-to-ADO calls have bounded wait behavior.
- All agent actions that mutate or mirror ADO state leave an internal Zendesk note.
- Sidebar create/link/unlink/comment actions stamp the acting Zendesk agent into ADO discussions where relevant, Zendesk internal notes, and Oracle audit summaries.

## 15. Files To Treat As Source Of Truth

- Sidebar implementation spec:
  [ZENDESK-SIDEBAR-APP-IMPLEMENTATION-SPEC.md](./ZENDESK-SIDEBAR-APP-IMPLEMENTATION-SPEC.md)
- Field contract:
  [ZENDESK-ADO-V1-FIELD-DEFINITIONS.md](./ZENDESK-ADO-V1-FIELD-DEFINITIONS.md)
- Current research and leverage choices:
  [2026-04-17-zendesk-sidebar-app-sota-and-knowledge-gap-analysis.md](../reports/2026-04-17-zendesk-sidebar-app-sota-and-knowledge-gap-analysis.md)
- Current hardening template:
  Section 12 of this document
- Current backend field IDs:
  [src/zendesk-field-ids.ts](/Users/musaalsalem/Projects/devazure-zendesk-sync/src/zendesk-field-ids.ts:1)

## 16. Immediate Next Step

After the 2026-04-24 readiness smoke pass, the next step should be:

1. run the controlled client pilot with two support analysts on `Musa ADO Form Testing`
2. capture any workflow confusion or missing fields before widening scope
3. replace the temporary tunnel URL with the stable public backend URL
4. repeat smoke create/link/unlink/comment behind the pilot-form gate after the stable URL swap
5. decide which ADO field-changing actions support is allowed to perform from Zendesk after v1
