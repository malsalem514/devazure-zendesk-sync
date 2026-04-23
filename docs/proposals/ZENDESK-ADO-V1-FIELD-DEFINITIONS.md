# Zendesk Azure DevOps V1 Field Definitions

**Status:** Draft for implementation planning, with sidebar app-first and minimal-field UX direction approved on 2026-04-23
**Prepared On:** 2026-04-15  
**Updated On:** 2026-04-23
**Purpose:** Define the v1 Zendesk field contract when a small private Zendesk sidebar app is the primary agent experience for Azure DevOps create, link, and status viewing.

## 1. Design Goal

Support agents should be able to stay in Zendesk and:

- use one consistent sidebar app workflow from day 1
- create a new ADO item or link an existing one from the same ticket
- see the current linked ADO reference and support-friendly engineering status without leaving Zendesk
- avoid cluttering the main Zendesk form with engineering backend fields
- avoid a second training round or second UX migration later

The approved v1 UX direction is:

- use a private Zendesk ticket sidebar app as the primary UI
- keep only the necessary ADO linkage field in Zendesk
- fetch live ADO details for the sidebar instead of mirroring them into ticket fields
- keep the standard support form as unchanged as possible
- during development and pilot, show the app only on the designated pilot form; current pilot form: `Musa ADO Form Testing` (`50882600373907`)

## 2. UX Principles

- Zendesk native support workflow remains the main ticket workflow.
- The sidebar app is the only new agent-facing Azure DevOps interaction surface in v1.
- The sidebar app should feel minimal: create, link, unlink, current status, open in ADO.
- The standard ticket form should not gain a new always-visible engineering field block.
- Existing support-visible fields should be reused only when they add clear value.
- If the app can answer the agent’s need, do not duplicate the same information in multiple visible fields.

## 3. Approved V1 Sidebar App Surface

The sidebar app should provide:

- `Create new ADO`
- `Link existing ADO`
- `Unlink ADO`
- input accepting either numeric ADO ID or full ADO URL
- current linked work item ID
- `Open in Azure DevOps` link
- support-friendly engineering status
- compact sync/error feedback

Recommended v1 rule:

- keep the app focused on one-ticket-at-a-time support workflow
- do not add ADO search by title/query in the first release unless the client explicitly wants it
- do not add comment sync UI, attachment UI, or admin tooling in the first release
- during development and pilot, the app should self-hide when `ticket.form.id` is not the designated pilot form

## 4. Minimal Standard-Form Visibility

The standard support form should stay mostly unchanged.

Recommended visible fields on the ticket itself:

| Zendesk Field | Visible To Agents | Purpose | Notes |
| --- | --- | --- | --- |
| None required for ADO v1 | No | Keep Zendesk uncluttered | The sidebar is the ADO workspace |

Recommended v1 rule:

- do not expose a new visible `ADO *` field block on the normal support form
- do not require a separate ADO-only form
- let the sidebar app be the primary place where agents view and act on engineering linkage

## 5. Recommended Machine-Owned Linkage Field

| Zendesk Field | Recommended Type | Visible To Agents | Purpose | Notes |
| --- | --- | --- | --- | --- |
| `ADO Work Item ID` | `integer` | No | Minimal linked ADO work item ID | Stored for fallback, reporting, and easy Zendesk-side inspection |

Recommended v1 visibility rule:

- `ADO Work Item ID` may exist globally in Zendesk
- it should stay off the standard support form unless an operator-only form needs it
- the sidebar app should use the backend summary first and this field only as a fallback

### Legacy mirror fields

These fields may exist from earlier implementation work:

- `ADO Work Item URL`
- `ADO Status`
- `ADO Status Detail`
- `sprint`
- `sprintStart`
- `sprintEnd`
- `ADO ETA`
- `ADO Sync Health`
- `ADO Last Sync At`
- `Dev Funnel #`

V1 rule:

- do not place these on the agent ticket form
- do not maintain them as a live mirror
- clear them on create/link/unlink to avoid stale values
- derive their equivalent display values live in the sidebar from ADO and `SYNC_LINK`

## 6. Minimum Recommended V1 Set

The leanest useful first release is:

- sidebar app create action
- sidebar app link-existing action
- sidebar app unlink action
- `SYNC_LINK` row as the canonical relationship record
- hidden `ADO Work Item ID` as the only necessary Zendesk custom field
- private notes for auditability

## 7. Recommended Support Status Taxonomy

Recommended sidebar/backend values:

- `In Dev Backlog`
- `Scheduled In Sprint`
- `Dev In Progress`
- `Support Ready`

Optional future values:

- `Blocked`
- `Cancelled`

Recommended v1 rule:

- keep the option set small and stable
- do not mirror raw ADO states one-for-one
- optimize for what support agents need to understand quickly

## 8. Recommended Status Detail Rules

Status detail should be a machine-generated, support-friendly sentence returned by the backend summary.

Recommended v1 behavior:

- derive it from ADO state plus sprint context
- keep it concise and readable
- let it be richer than `ADO Status`, but not a full change log
- when a dated sprint exists, include the sprint date range by default

Example values:

- `Not yet linked to Azure DevOps`
- `In backlog`
- `Scheduled in Sprint 112`
- `In testing in Sprint 112`
- `In development in Sprint 112`
- `Support ready`
- `Resolved in Sprint 112`

## 9. Recommended Status Derivation Rules

| ADO Condition | Support Status | Notes |
| --- | --- | --- |
| No linked item | blank | Ticket has not been linked or created yet |
| Linked item with no dated sprint, state like `New` or backlog | `In Dev Backlog` | Default state for newly created support bugs not in a sprint |
| Linked item has dated sprint but is not yet actively worked | `Scheduled In Sprint` | Shows that planning occurred |
| Linked item is active or in dev/testing flow | `Dev In Progress` | Covers `Active`, `In Development`, `In Testing`, `Waiting on Development`, `Waiting on Testing` |
| Linked item is engineering-complete | `Support Ready` | Covers `Resolved`, `Completed`, `Closed`, or equivalent accepted completion states |

## 10. Sprint And ETA Rules

Return these in the backend sidebar model only when the linked ADO work item is assigned to an iteration with a real `startDate` or `finishDate`:

- `ADO Sprint`
- `ADO Sprint Start`
- `ADO Sprint End`

If the linked item is only assigned to a team root or non-dated iteration:

- keep sprint display values blank

Recommended v1 ETA hierarchy:

1. explicit engineering target date if the client later identifies one
2. sprint end date
3. blank

Recommended v1 behavior:

- ETA usually mirrors sprint end
- do not invent an ETA when there is no dated sprint and no explicit target date

## 11. Field Ownership And Update Rules

| Field | System Of Record | Who Updates It |
| --- | --- | --- |
| sidebar app action state | Zendesk app UI | App manages transient UI state only |
| `ADO Work Item ID` | Azure DevOps linkage | Integration only |
| `SYNC_LINK` | Integration relationship store | Integration only |
| live ADO title/status/sprint/ETA/owner/priority/severity | Azure DevOps | Sidebar reads through backend |
| private Zendesk audit notes | Integration | Integration writes on create/link/unlink and selected sync events |

Operational rules:

- agents should not maintain any `ADO *` fields manually
- the sidebar app should be the only create/link action surface
- unlink should be available only from the linked sidebar state and guarded by confirmation
- detailed ongoing updates should be delivered through the app display and selected private notes, not a visible field sprawl

## 12. Linked Existing Item Rules

When a Zendesk ticket is linked to an existing ADO work item:

- accept either a numeric work item ID or a full ADO work item URL
- create the active `SYNC_LINK` record
- populate only the minimal Zendesk `ADO Work Item ID` field
- clear legacy mirrored ADO fields so stale values do not remain on the ticket
- add the `zendesk:id:<ticketId>` tag to the ADO item for dedupe
- do not force routing defaults onto the linked item
- do not overwrite ADO project, area path, or product with creation-time defaults

This is important because linked items may:

- belong to a different project
- have a different bucket
- already be in a sprint
- already be resolved

## 13. Approved Sidebar App Behavior

When no ADO item is linked:

- show `Create new ADO`
- show `Link existing ADO`
- show concise helper text

When an ADO item is linked:

- show work item ID
- show `Open in Azure DevOps`
- show live support-friendly ADO status
- show live support-friendly status detail
- optionally show sprint/ETA in a compact secondary section
- show `Unlink ADO` in the Update tab with confirmation

Recommended success behavior:

- successful create updates the app immediately with the new link
- successful link-existing updates the app immediately with the linked item details
- successful unlink clears the app back to the create/link state
- write a short Zendesk private note for auditability
- update only the hidden `ADO Work Item ID` field on create/link
- clear `ADO Work Item ID` and legacy mirrored fields on unlink

Recommended failure behavior:

- show support-friendly error text in the app
- do not expose raw backend jargon unless needed for operator troubleshooting
- keep the rest of the ticket workflow unaffected

Form-scoping behavior during development and pilot:

- if `ticket.form.id` matches the designated pilot form, show the app normally
- if `ticket.form.id` does not match the designated pilot form, hide the app completely or show a minimal unavailable state
- react to `ticket.form.id.changed` so the app updates immediately when the agent switches forms
- current pilot-form assumption: `Musa ADO Form Testing` (`50882600373907`)

## 14. Recommended Private Note Templates

On create success:

- `ADO Bug #{id} created`
- `Open in Azure DevOps: {url}`
- `Status: {statusDetail}`

On link-existing success:

- `Linked to existing ADO work item #{id}`
- `Open in Azure DevOps: {url}`
- `Status: {statusDetail}`

On relink success:

- `Re-linked from ADO work item #{oldId} to #{newId}`
- `Open in Azure DevOps: {url}`

On failure:

- keep the wording agent-friendly and specific
- examples:
  - `We could not find that Azure DevOps work item. Check the ID or URL and try again.`
  - `This ticket is already linked to an Azure DevOps item. Open the current link or relink only if that workflow is approved.`

## 15. Open Questions

- Should the first sidebar app release include ADO search by title, or only ID/URL paste for link-existing?
- Should relinking be available in the first release, or deferred until create/link is stable?
- Should sprint and ETA be shown in the first app release, or only status plus detail?
- Should `Dev Funnel #` remain visibly on the ticket form, or become a legacy/backward-compatibility field only?

## 16. Recommended Next Step

Implement the sidebar app as the primary UX first, then validate with agents whether:

- the app is enough on its own without new visible Zendesk fields
- `Dev Funnel #` remains useful as a visible legacy reference
- the app status panel reduces follow-up questions
- hidden backend fields still provide enough reporting and operational visibility

If later more richness is needed, the next enhancement should be expanding the app, not adding a large visible field block to the form.
