# Zendesk Azure DevOps V1 Field Definitions

**Status:** Draft for implementation planning  
**Prepared On:** 2026-04-15  
**Purpose:** Define the initial Zendesk fields required to support Azure DevOps linking, monitoring, sprint visibility, and sync operations.

## 1. Design Goal

Support agents should be able to stay in Zendesk and still see:

- whether a ticket is linked to Azure DevOps
- the linked work item reference
- the current engineering status
- whether the item is assigned to a sprint
- sprint start and end dates
- current ETA

The fields below are designed to support that experience without overloading Zendesk's native support workflow status.

## 2. Field Design Principles

- Zendesk native status remains the support workflow status.
- Azure DevOps progress is represented in separate machine-owned fields.
- Support-visible fields should be simple and support-friendly.
- Operational fields should help the integration troubleshoot and report without cluttering the main agent workflow.
- If Zendesk cannot guarantee true agent read-only behavior for these fields, the authoritative display should move into a Zendesk sidebar app while the fields remain in place for reporting and triggers.

## 3. Working V1 Assumptions

These field definitions are based on the current working assumptions:

- new Zendesk escalations create ADO `Bug` items by default
- v1 routing prioritizes:
  - `Central_Portal`
  - `Financials`
  - `Merch`
  - `WMS`
  - `SnD`
  - `Printing`
  - `Omni`
  - `Store`
- `Omni` defaults to `\\VisionSuite\\Area\\Omni POS Mobile Funnel` in v1
- `BI`, `Reports`, `Ecomm`, `Planning`, and `Planning.net` remain pending for business approval

## 4. Recommended Support-Visible Fields

These are the fields agents should be able to see directly on the ticket.

| Zendesk Field | Recommended Type | Visible To Agents | Purpose | Notes |
| --- | --- | --- | --- | --- |
| `ADO Work Item ID` | `integer` | Yes | Linked ADO work item ID | Good for quick reference and reporting |
| `ADO Work Item URL` | `text` | Yes | Deep link to the ADO item | Useful for one-click access |
| `ADO Status` | `tagger` | Yes | Support-friendly engineering status | Machine-owned option set |
| `ADO Status Detail` | `text` | Yes | Richer human-readable engineering explanation | Default format: short text plus sprint dates, for example `In testing in Sprint 112 (Apr 18 - Apr 24)` |
| `ADO Sprint` | `text` | Yes | Current sprint or iteration name | Blank when no dated sprint is assigned |
| `ADO Sprint Start` | `date` | Yes | Sprint start date | Blank when no dated sprint is assigned |
| `ADO Sprint End` | `date` | Yes | Sprint end date | Blank when no dated sprint is assigned |
| `ADO ETA` | `date` | Yes | Expected engineering delivery date | Usually same as sprint end in v1 |

## 5. Recommended Operational Fields

These help the integration operate reliably and support reporting or troubleshooting.

| Zendesk Field | Recommended Type | Visible To Agents | Purpose | Notes |
| --- | --- | --- | --- | --- |
| `ADO Project` | `tagger` | Optional | Linked ADO project name | Useful if v1 later supports more than one project |
| `ADO Area Path` | `text` | Optional | Actual ADO area path | Keep even when linked item was not created by routing defaults |
| `ADO Product` | `text` or `tagger` | Optional | Mirrored ADO `Custom.Product` | Useful when linked existing item differs from Zendesk product selection |
| `ADO Sync Health` | `tagger` | Usually no | Integration health indicator | Suggested values: `ok`, `warning`, `error` |
| `ADO Last Sync At` | `text` | Usually no | Last successful sync timestamp | Store full ISO timestamp |

## 6. Minimum Recommended V1 Set

If we want the leanest possible initial rollout, the minimum useful set is:

- `ADO Work Item ID`
- `ADO Work Item URL`
- `ADO Status`
- `ADO Status Detail`
- `ADO Sprint`
- `ADO Sprint Start`
- `ADO Sprint End`
- `ADO ETA`
- `ADO Sync Health`
- `ADO Last Sync At`

## 7. Recommended `ADO Status` Option Set

Recommended machine-owned values:

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

## 8. Recommended `ADO Status Detail` Rules

`ADO Status Detail` should be a machine-generated, support-friendly sentence.

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

Recommended formatting rules:

- include sprint name when the work item is in a dated sprint
- include sprint date range by default when available
- avoid internal jargon that agents do not need
- do not include noisy low-value metadata such as raw area paths or bucket values

Suggested formatting templates:

| Condition | `ADO Status Detail` template |
| --- | --- |
| No linked item | `Not yet linked to Azure DevOps` |
| No dated sprint, backlog/new state | `In backlog` |
| Dated sprint, not yet active | `Scheduled in {sprint} ({start} - {end})` |
| Active development state | `In development in {sprint} ({start} - {end})` |
| Testing state | `In testing in {sprint} ({start} - {end})` |
| Waiting on development | `Waiting on development in {sprint} ({start} - {end})` |
| Waiting on testing | `Waiting on testing in {sprint} ({start} - {end})` |
| Engineering complete | `Support ready` or `Resolved in {sprint} ({start} - {end})` |

Example:

- `In testing in Sprint 112 (Apr 18 - Apr 24)`

## 9. Recommended `ADO Status` Derivation Rules

| ADO Condition | Zendesk `ADO Status` | Notes |
| --- | --- | --- |
| No linked item | blank | Ticket has not been linked or created yet |
| Linked item with no dated sprint, state like `New` or backlog | `In Dev Backlog` | Default state for newly created support bugs not in a sprint |
| Linked item has dated sprint but is not yet actively worked | `Scheduled In Sprint` | Shows that planning occurred |
| Linked item is active or in dev/testing flow | `Dev In Progress` | Covers `Active`, `In Development`, `In Testing`, `Waiting on Development`, `Waiting on Testing` |
| Linked item is engineering-complete | `Support Ready` | Covers `Resolved`, `Completed`, `Closed`, or equivalent accepted completion states |

Recommended priority of derivation:

1. completion state wins
2. active work state wins
3. sprint assignment without active work gives `Scheduled In Sprint`
4. otherwise `In Dev Backlog`

Recommended pairing rule:

- `ADO Status` stays analytics-friendly and stable
- `ADO Status Detail` gives the richer agent-facing explanation

## 10. Sprint And ETA Rules

### Sprint visibility

Populate these only when the linked ADO work item is assigned to an iteration with a real `startDate` or `finishDate`:

- `ADO Sprint`
- `ADO Sprint Start`
- `ADO Sprint End`

If the linked item is only assigned to a team root or non-dated iteration:

- keep sprint fields blank

### ETA

Recommended v1 hierarchy:

1. explicit engineering target date if the client later identifies one
2. sprint end date
3. blank

Recommended v1 behavior:

- `ADO ETA` usually mirrors `ADO Sprint End`
- do not invent an ETA when there is no dated sprint and no explicit target date

## 11. Field Ownership And Update Rules

| Field | System Of Record | Who Updates It |
| --- | --- | --- |
| `ADO Work Item ID` | Azure DevOps linkage | Integration only |
| `ADO Work Item URL` | Azure DevOps linkage | Integration only |
| `ADO Status` | Azure DevOps | Integration only |
| `ADO Status Detail` | Azure DevOps plus integration formatting | Integration only |
| `ADO Sprint` | Azure DevOps | Integration only |
| `ADO Sprint Start` | Azure DevOps | Integration only |
| `ADO Sprint End` | Azure DevOps | Integration only |
| `ADO ETA` | Azure DevOps | Integration only |
| `ADO Project` | Azure DevOps | Integration only |
| `ADO Area Path` | Azure DevOps | Integration only |
| `ADO Product` | Azure DevOps | Integration only |
| `ADO Sync Health` | Integration | Integration only |
| `ADO Last Sync At` | Integration | Integration only |

Operational rule:

- agents should not be expected to maintain any `ADO *` fields manually
- detailed ongoing updates should be delivered through Zendesk private notes, not a rolling summary field

## 12. Linked Existing Item Rules

When a Zendesk ticket is linked to an existing ADO work item:

- populate all `ADO *` fields from the real linked item
- do not force routing defaults onto the item
- do not overwrite ADO project, area path, or product with creation-time defaults

This is important because linked items may:

- belong to a different project
- have a different bucket
- already be in a sprint
- already be resolved

## 13. Recommended Layout For Agents

Suggested field order:

1. `ADO Work Item ID`
2. `ADO Work Item URL`
3. `ADO Status`
4. `ADO Status Detail`
5. `ADO Sprint`
6. `ADO Sprint Start`
7. `ADO Sprint End`
8. `ADO ETA`

Suggested hidden or collapsed fields:

- `ADO Project`
- `ADO Area Path`
- `ADO Product`
- `ADO Sync Health`
- `ADO Last Sync At`

## 14. Open Questions

- Should `ADO Work Item URL` be a visible text field, or should the sidebar app become the primary link surface?
- Should `ADO Project` be visible to agents in v1?
- Should `ADO Product` be mirrored for agent visibility, or only kept operationally?
- Should `ADO Status` remain blank before linking, or have an explicit `Not Linked` value?

## 15. Recommended Next Step

Implement the minimum v1 field set first, then validate with agents whether:

- fields alone are enough
- the status labels feel intuitive
- the richer `ADO Status Detail` field actually reduces follow-up questions
- sprint visibility answers their day-to-day follow-up questions

If not, the next enhancement should be a Zendesk sidebar app, not a larger field sprawl.
