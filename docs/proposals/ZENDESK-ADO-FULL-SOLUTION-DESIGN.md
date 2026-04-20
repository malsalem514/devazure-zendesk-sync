# Zendesk ADO Full Solution Design

**Status:** Draft for implementation readiness  
**Prepared On:** 2026-04-15  
**Purpose:** Consolidate the full end-to-end design for the client-deliverable Zendesk to Azure DevOps integration before deployment planning and build execution.

## 1. Purpose

This document defines the full solution design for the Zendesk to Azure DevOps integration.

It is intended to answer:

- what the system does
- how the major components fit together
- how data moves between Zendesk, Azure DevOps, Oracle, and the integration service
- how the multi-team Zendesk tenant should be scoped safely
- how retries, security, audit, and operator behavior should work

This document is the build-facing design baseline.

Related documents:

- [ZENDESK-AZURE-DEVOPS-INTEGRATION-TECHNICAL-SPEC.md](./ZENDESK-AZURE-DEVOPS-INTEGRATION-TECHNICAL-SPEC.md)
- [ZENDESK-ADO-INTEGRATION-SOLUTION-SUMMARY.md](./ZENDESK-ADO-INTEGRATION-SOLUTION-SUMMARY.md)
- [ZENDESK-ADO-V1-ROUTING-MATRIX.md](./ZENDESK-ADO-V1-ROUTING-MATRIX.md)
- [ZENDESK-ADO-V1-FIELD-DEFINITIONS.md](./ZENDESK-ADO-V1-FIELD-DEFINITIONS.md)
- [2026-04-15-zendesk-ado-sota-research-gap-analysis.md](../reports/2026-04-15-zendesk-ado-sota-research-gap-analysis.md)

## 2. Design Goals

The solution must allow support agents to stay in Zendesk while still being able to:

- create a new Azure DevOps issue from a Zendesk ticket
- link a Zendesk ticket to an existing Azure DevOps work item
- monitor engineering status from Zendesk
- see whether the issue is in a sprint
- see sprint start and end dates
- see ETA from engineering planning data
- receive important engineering updates as Zendesk private notes

The solution must also:

- remain fully standalone from MusaOS when delivered
- run as a separate service from `MyReports`
- fit the client's existing Linux Docker host model
- use Oracle as the persistence layer
- preserve traceability and auditability
- avoid duplicate sync loops
- tolerate transient API and network failures

## 3. Non-Goals For V1

The following are explicitly not required for v1:

- replacing Zendesk native support status with Azure DevOps state
- exposing the full raw ADO area-path tree to agents
- building a rich Zendesk sidebar app before the workflow is validated
- introducing new custom fields in Azure DevOps unless a later reporting need requires them
- introducing Redis, PostgreSQL, or Temporal just for orchestration
- broad multi-project intelligent routing beyond the approved v1 subset

## 4. Confirmed Tenant And Infrastructure Constraints

### Zendesk

Confirmed live forms:

- `Support` (`41831496024083`) — active, default
- `L1 Helpdesk` (`41726482067219`) — active
- `IT` (`43269650284563`) — active
- `Musa ADO Form Testing` (`50882600373907`) — active
- `Support - SW Test` / `Testing - Do not use` (`49194441682579`) — active
- one inactive test form

Important tenant implication:

- Zendesk ticket fields are created at the account level
- field visibility on tickets is controlled per form using each form's `ticket_field_ids`
- the integration should therefore create global custom fields, but attach them only to the intended forms

### Azure DevOps

Confirmed live projects:

- `VisionSuite`
- `Vision Analytics`

Confirmed current v1 work item assumptions:

- default created type: `Bug`
- default `Custom.Bucket`: `Support`
- default `Custom.Unplanned`: `true`
- default `Microsoft.VSTS.Common.ValueArea`: `Business`

### Oracle

Confirmed live database facts:

- database: `SUPPOPS`
- version: Oracle Database 19c Standard Edition 2
- authenticated schema: `AUTOMATION`
- schema can create tables, views, sequences, procedures, triggers, types, and jobs
- AQ admin package is not currently callable from the schema

Current design implication:

- v1 should use Oracle-backed worker tables, not AQ

### Linux Host

Confirmed live host:

- host: `ubuntu-docker-host`
- IP: `172.16.20.97`
- OS: Ubuntu 24.04 LTS
- reverse proxy: host-level `Caddy`
- deployment root: `/srv/stacks`
- live stacks include `myreports`, `erpnext`, `watchtower`, and `projeqtor`

Current design implication:

- the integration should follow the live `MyReports` pattern:
  - its own stack directory
  - loopback port bind
  - Caddy reverse proxy entry
  - Watchtower-managed image refresh

## 5. Solution Overview

The integration will be a standalone Node.js and TypeScript service that exposes webhook endpoints, executes durable sync jobs, persists state in Oracle, and updates Zendesk and Azure DevOps according to deterministic routing and mapping rules.

High-level architecture:

```text
Zendesk
  |  webhook / API
  v
Zendesk ADO Integration Service
  |-- inbound API routes
  |-- sync planner
  |-- mapping + routing engine
  |-- Oracle persistence + worker tables
  |-- retry/replay engine
  |-- reconciliation scheduler
  |-- outbound Zendesk client
  |-- outbound Azure DevOps client
  v
Azure DevOps
```

Operationally:

- Zendesk drives new escalation and selected ticket updates
- Azure DevOps drives engineering-state, sprint, and comment updates
- Oracle stores the durable sync ledger and work queue
- scheduled reconciliation repairs missed events and refreshes sprint-driven ETA data

## 6. Major Components

### 6.1 HTTP API Layer

The service should expose these route families:

- `POST /webhooks/zendesk`
- `POST /webhooks/ado`
- `GET /healthz`
- `GET /readyz`
- `POST /internal/reconcile`
- optional future operator endpoints under `/internal/admin/*`

Responsibilities (follows the hookdeck canonical webhook handler sequence):

1. verify webhook signature (Zendesk HMAC-SHA256 or ADO HMAC-SHA1)
2. parse payload
3. check idempotency: compute dedup key, check against `sync_event` table
4. persist inbound event to `sync_event` and insert `sync_job`
5. return 2xx immediately
6. worker processes the job asynchronously

This ensures no inline heavy work and no lost events.

### 6.2 Sync Planning Layer

Core responsibilities:

- identify what kind of event occurred
- decide whether the event is actionable
- derive a normalized internal command
- compute the required outbound actions
- enforce directional ownership rules
- prevent circular loops

Example normalized commands:

- `create_ado_work_item_from_zendesk`
- `link_existing_ado_work_item`
- `sync_ado_state_to_zendesk`
- `sync_zendesk_public_comment_to_ado`
- `sync_ado_comment_to_zendesk_private_note`
- `sync_attachment_to_ado`
- `reconcile_link_state`

### 6.3 Mapping And Routing Layer

Core responsibilities:

- map Zendesk fields into ADO payloads
- map ADO fields into Zendesk `ADO *` fields
- resolve v1 routing based on the approved product-family matrix
- produce `ADO Status` and `ADO Status Detail`
- derive sprint name, sprint dates, and ETA

This layer should remain configuration-driven where practical.

### 6.4 Outbound Client Layer

Service adapters and their implementation basis:

- **Zendesk API** — use `node-zendesk` v6 (65K+/week downloads, recommended by Zendesk docs). Covers ticket field CRUD, ticket updates with private notes, webhook management, trigger management. Our `zendesk-signature.ts` stays for inbound webhook verification (no package exists for this).
- **Azure DevOps API** — keep our hand-rolled `devazure-client.ts` with `fetch` + Basic auth (PAT) + JSON Patch. Import TypeScript types from `azure-devops-node-api` v15 (`import type` only) for `JsonPatchOperation`, `WorkItem`, `WorkItemClassificationNode`, etc. The SDK's HTTP layer (`typed-rest-client`) adds unnecessary complexity, and service hooks management is not covered by the SDK.
- **Oracle persistence** — use `oracledb` v6.10 in thin mode. Copy the pool + query helper pattern from `myreports/lib/oracle.ts` (lazy singleton pool, `query<T>()`, `execute()`, `executeMany()`, `safeExecuteDDL()`).

Each adapter should:

- centralize auth and base URLs
- normalize error handling
- expose idempotent operations where possible
- emit structured logs and audit events

### 6.5 Worker And Reconciliation Layer

Responsibilities:

- poll Oracle-backed worker tables using `SELECT FOR UPDATE SKIP LOCKED` (confirmed supported on Oracle 19c)
- claim pending jobs safely — fetch one row via cursor, update to `PROCESSING`, commit, then execute
- execute retries with exponential backoff (`next_process_at = NOW + 2^attempt_count seconds + jitter`, capped at 1 hour)
- run scheduled reconciliation via `node-cron` (every 15 minutes: refresh open links, retry failed jobs, refresh sprint metadata)
- recover from missed webhooks and transient failures
- detect stale jobs stuck in `PROCESSING` beyond a timeout and reset to `PENDING`

Reference architecture: yoomoney/db-queue (Java, 252 stars, explicit Oracle support). API design modeled after pg-boss (Node.js, 3.4K stars).

Important Oracle caveat: do NOT combine `FETCH FIRST N ROWS ONLY` or `ROWNUM` with `FOR UPDATE SKIP LOCKED` — Oracle evaluates the row limit before checking locks. Use cursor fetch-one or `oracledb`'s `maxRows` option instead.

### 6.6 Operator And Audit Layer

Responsibilities:

- maintain durable audit history
- record sync attempts and failure reasons
- support replay of failed jobs
- make it easy to answer:
  - what happened
  - when it happened
  - what changed
  - whether the integration or a human made the change

## 7. Canonical Solution Flows

## 7.1 Zendesk Creates A New ADO Item

Trigger conditions:

- ticket is on an approved form
- ticket is explicitly escalated for development
- ticket does not already have a linked ADO item

Flow:

1. Zendesk trigger/webhook sends the event.
2. The integration validates the webhook and persists the inbound event.
3. The planner loads the current ticket snapshot from Zendesk.
4. The routing engine resolves:
   - ADO project
   - ADO area path
   - ADO `Custom.Product`
   - work item type
5. The description composer builds a structured ADO description from:
   - subject
   - issue details
   - repro steps
   - acceptance criteria
   - support findings
   - Zendesk backlink
6. The service creates the ADO work item.
7. The service persists the new link in Oracle.
8. The service updates Zendesk:
   - `ADO Work Item ID`
   - `ADO Work Item URL`
   - `ADO Status`
   - `ADO Status Detail`
   - sync metadata
9. The service writes a Zendesk private note confirming the ADO link.

## 7.2 Zendesk Links To An Existing ADO Item

Trigger conditions:

- agent provides an ADO numeric ID or ADO URL

Flow:

1. Integration receives the requested link action.
2. The service resolves and validates the ADO work item.
3. The service records the new link in Oracle.
4. If a previous link existed, the service records a relink audit event.
5. The service mirrors the actual linked ADO item into Zendesk fields.
6. The service adds a private note showing the link action.

Important rule:

- linking an existing item must never re-route or reclassify the ADO item

## 7.3 Zendesk Updates That Should Flow To ADO

Candidate events:

- selected public replies
- selected support notes tagged for sync
- selected attachment additions
- selected support-field changes that the business wants mirrored

Rules:

- Zendesk remains source of record for support-owned fields
- public replies become ADO discussion comments
- private notes do not sync unless explicitly marked
- mirrored writes are stamped to prevent echo loops

## 7.4 ADO Updates That Should Flow To Zendesk

Candidate events:

- work item state changes
- custom status changes
- iteration path changes
- assigned sprint date changes
- selected ADO discussion comments
- selected attachment additions

Flow:

1. ADO service hook notifies the integration.
2. The event is persisted in Oracle.
3. The planner resolves the affected link.
4. The integration fetches the latest ADO work item state.
5. The integration updates Zendesk fields:
   - `ADO Status`
   - `ADO Status Detail`
   - `ADO Sprint`
   - `ADO Sprint Start`
   - `ADO Sprint End`
   - `ADO ETA`
   - `ADO Last Sync At`
   - `ADO Sync Health`
6. If a meaningful update occurred, the integration adds a private note to Zendesk.

## 7.5 Reconciliation Flow

Scheduled reconciliation exists to:

- catch missed webhook events
- refresh sprint metadata and ETA
- recover after transient API failures
- repair divergence between the systems

Core reconciliation jobs:

- refresh open links changed recently
- refresh links in dated sprints
- retry failed comment syncs
- retry failed attachment syncs
- detect broken or deleted linked records

## 8. Zendesk Design

## 8.1 Field Strategy

Zendesk support workflow status remains native Zendesk behavior.

Engineering visibility is represented through separate integration-owned fields.

Required support-visible fields:

- `ADO Work Item ID`
- `ADO Work Item URL`
- `ADO Status`
- `ADO Status Detail`
- `ADO Sprint`
- `ADO Sprint Start`
- `ADO Sprint End`
- `ADO ETA`

Required operational fields:

- `ADO Sync Health`
- `ADO Last Sync At`

Optional later operational fields:

- `ADO Project`
- `ADO Area Path`
- `ADO Product`

## 8.2 Multi-Team Form Scoping

Because Zendesk fields are global but forms control exposure, the safe scoping model is:

- create the `ADO *` fields globally
- attach them first to `Musa ADO Form Testing`
- validate behavior there
- then expand to broader support forms as approved
- do not attach them to `L1 Helpdesk`
- do not attach them to `IT`

Current recommended v1 rollout scope:

- forms in scope: `Musa ADO Form Testing`, then broader support forms as approved
- forms out of scope: `L1 Helpdesk`, `IT`, inactive test form

## 8.3 Zendesk Field Placement

Recommended placement on the `Support` form:

- after the existing dev/escalation block
- near:
  - `Dev Funnel #`
  - `Scopus Case #`
  - `Developer`

Approved v1 support-visible order on the standard form:

1. existing `Dev Funnel #`

The primary v1 create/link/status experience should live in a small private Zendesk sidebar app, not in standard form fields.

The machine-owned `ADO *` fields should not be shown on the standard `Support` workflow in the first app-first rollout.

If a later pilot proves that agents need more inline visibility on the form itself, the next-smallest enhancement should be one compact support-friendly status field near `Dev Funnel #`, not the full backend field block.

Previous support-visible order if a later rollout intentionally exposes the synced fields:

1. `ADO Work Item ID`
2. `ADO Work Item URL`
3. `ADO Status`
4. `ADO Status Detail`
5. `ADO Sprint`
6. `ADO Sprint Start`
7. `ADO Sprint End`
8. `ADO ETA`

Recommended hidden or collapsed operational fields:

- `ADO Sync Health`
- `ADO Last Sync At`
- any future `ADO Area Path` or `ADO Product` fields

## 8.4 Zendesk Triggering Model

The integration should use dedicated Zendesk automation assets, not overload the Scopus assets.

Recommended assets:

- one dedicated webhook target for the integration service
- one or more dedicated triggers for escalation and update events
- explicit tag-based or action-based escalation criteria

Recommended v1 trigger behavior:

- do not auto-escalate every support ticket
- require an explicit support action, tag, or field state
- keep the Scopus flow intact during rollout

## 9. Azure DevOps Design

## 9.1 Work Item Strategy

V1 default behavior:

- create `Bug` items by default
- use `VisionSuite` unless routing sends the issue elsewhere

Required creation defaults:

- `Custom.Bucket = Support`
- `Custom.Unplanned = true`
- `Microsoft.VSTS.Common.ValueArea = Business`

## 9.2 Routing Strategy

The routing design remains curated, not open-ended.

Approved v1 families:

- `Central_Portal`
- `Financials`
- `Merch`
- `WMS`
- `SnD`
- `Printing`
- `Omni`
- `Store`

Pending families:

- `BI`
- `Reports`
- `Ecomm`
- `Planning`
- `Planning.net`

Detailed routing remains defined in:

- [ZENDESK-ADO-V1-ROUTING-MATRIX.md](./ZENDESK-ADO-V1-ROUTING-MATRIX.md)

## 9.3 ADO Field Strategy

No new ADO custom fields are required for v1.

V1 should reuse existing ADO fields:

- `Custom.Client`
- `Custom.Product`
- `Custom.Status`
- `Custom.CRF`
- `Custom.XREF`
- existing iteration metadata

Traceability should be preserved via:

- work item description
- backlink URL to the Zendesk ticket
- deterministic tag or reference convention
- optional hyperlink relation back to Zendesk

## 10. Status, Sprint, And ETA Design

## 10.1 `ADO Status`

V1 normalized status set:

- `In Dev Backlog`
- `Scheduled In Sprint`
- `Dev In Progress`
- `Support Ready`

The goal is stable support-friendly analytics, not raw ADO mirroring.

## 10.2 `ADO Status Detail`

`ADO Status Detail` is the richer human-readable sentence.

Examples:

- `Not yet linked to Azure DevOps`
- `In backlog`
- `Scheduled in Sprint 112 (Apr 18 - Apr 24)`
- `In development in Sprint 112 (Apr 18 - Apr 24)`
- `In testing in Sprint 112 (Apr 18 - Apr 24)`
- `Support ready`

## 10.3 Sprint And ETA Rules

Populate sprint fields only when the linked iteration has real dates.

Rules:

- no dated sprint -> keep sprint fields blank
- dated sprint -> populate sprint name and dates
- ETA hierarchy:
  1. explicit target date if later approved
  2. sprint end date
  3. blank

## 11. Comment And Note Design

Zendesk and ADO comments should not mirror blindly.

V1 policy:

- Zendesk public reply -> ADO discussion
- Zendesk private note -> no sync by default
- Zendesk private note with explicit sync marker -> eligible for ADO sync
- ADO discussion -> Zendesk private note

All mirrored notes must include origin context:

- source system
- original author
- original timestamp
- integration marker

## 12. Attachment Design

V1 attachment behavior:

- Zendesk attachments on relevant escalated events should upload to ADO and attach to the work item
- ADO-originated attachments may be mirrored back selectively later
- all attachment sync actions must be durable and retryable

Open implementation check:

- verify ADO attachment upload permission before calling attachment sync production-ready

## 13. Oracle Persistence Design

Oracle is the durable system of record for integration state.

## 13.1 Persistence Responsibilities

Oracle must store:

- link state between Zendesk tickets and ADO work items
- inbound events
- planned jobs
- retry attempts
- audit history
- iteration metadata cache when needed
- comment and attachment deduplication keys

## 13.2 Recommended Core Tables

### `sync_link`

Purpose:

- one record per Zendesk ticket and linked ADO work item pair

Suggested contents:

- internal link id
- zendesk ticket id
- ado organization
- ado project
- ado work item id
- link mode: `created` or `linked`
- active flag
- created at
- updated at
- last synced at

### `sync_event`

Purpose:

- durable raw inbound event ledger

Suggested contents:

- event id
- source system
- source event id or dedupe key
- event type
- received at
- payload snapshot
- processing state

### `sync_job`

Purpose:

- worker queue table for planned work

Suggested contents:

- job id
- job type
- related event id
- related link id
- current status
- available at
- retry count
- next retry at
- last error code
- last error message

### `sync_attempt`

Purpose:

- execution history for each job attempt

Suggested contents:

- attempt id
- job id
- started at
- finished at
- result
- outbound request metadata
- error summary

### `comment_sync_map`

Purpose:

- loop prevention and dedupe for mirrored comments

Suggested contents:

- source system
- source comment id
- target system
- target comment id
- link id
- sync marker

### `attachment_sync_map`

Purpose:

- dedupe for mirrored attachments

Suggested contents:

- source system
- source attachment id
- target system
- target attachment id
- checksum if available
- link id

### `iteration_cache`

Purpose:

- cache iteration name and date metadata for ETA and detail formatting

Suggested contents:

- project
- iteration path
- display name
- start date
- finish date
- refreshed at

### `audit_log`

Purpose:

- business-readable and operator-readable change history

Suggested contents:

- audit id
- action type
- actor type
- actor identity
- source system
- target system
- entity ids
- summary
- created at

## 13.3 Worker Model

The worker model is Oracle-table based, using `SELECT FOR UPDATE SKIP LOCKED` for safe concurrent claiming.

Confirmed claiming pattern:

```
BEGIN transaction
  → SELECT id, job_type, payload FROM sync_job
    WHERE status='PENDING' AND next_process_at<=SYSTIMESTAMP
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    (fetch one row via cursor or oracledb maxRows:1)
  → UPDATE sync_job SET status='PROCESSING', started_at=SYSTIMESTAMP WHERE id=:id
COMMIT

→ Execute job logic (Zendesk/ADO API calls)

→ On success: UPDATE sync_job SET status='COMPLETED', finished_at=SYSTIMESTAMP
→ On failure: UPDATE sync_job SET status='PENDING', attempt_count=attempt_count+1,
    next_process_at=SYSTIMESTAMP + NUMTODSINTERVAL(LEAST(POWER(2, attempt_count), 3600), 'SECOND')
→ On max retries exceeded: UPDATE sync_job SET status='DEAD'
→ Insert sync_attempt record for every execution (success or failure)
```

Scheduling:

- `node-cron` triggers worker polling every N seconds (configurable, default 10s)
- Separate `node-cron` job triggers reconciliation every 15 minutes
- Stale job sweep runs on reconciliation cycle: reset jobs stuck in `PROCESSING` for >5 minutes back to `PENDING`

If a worker crashes mid-job, Oracle automatically rolls back the transaction and releases the `FOR UPDATE` lock, making the job available for the next poll cycle.

This keeps v1 operationally simple and aligned with the current Oracle permissions.

## 14. Idempotency And Loop Prevention

This is mandatory. The implementation follows the Truto.one 5-pillar bidirectional sync pattern (see `docs/reports/2026-04-16-sota-inventory-and-leverage-plan.md`).

### 14.1 Five Pillars

1. **Origin tagging** — stamp every outbound write with a sync source marker. On inbound webhook, check if the change was authored by the integration and skip if so. For comments: include `[Synced from {system} by integration]` in the body. For ADO work items: check if the last change was made by the integration identity.

2. **Fingerprint comparison** — hash the relevant payload fields into a fingerprint. Compare against the stored `last_applied_fingerprint` in the `sync_link` record. Skip the update if the fingerprint has not changed. This prevents no-op updates that inflate revision history.

3. **Sync journal** — the `sync_link` table serves as the per-link journal, storing: `zendesk_ticket_id`, `ado_work_item_id`, `last_applied_fingerprint`, `last_sync_source`, `last_synced_at`.

4. **Composite dedup key** — each inbound event gets a dedup key: `{source_system}:{event_type}:{entity_id}:{event_id_or_timestamp}`. Checked against the `sync_event` table before processing. Dedup TTL must exceed the upstream retry window (Zendesk retries for ~48 hours).

5. **Field ownership** — each synced field is designated as Zendesk-owned or ADO-owned (see tech spec section 5, "Draft Source Of Record Rules"). The integration only writes in the direction dictated by ownership. Zendesk owns: subject, description, priority, support status. ADO owns: engineering state, sprint, ETA, developer discussion.

### 14.2 Required Protections

- inbound webhook dedupe key per source event (pillar 4)
- outbound write markers: origin stamp in comments, integration identity check on work item changes (pillar 1)
- fingerprint comparison before every outbound update (pillar 2)
- comment-sync map table (`comment_sync_map`) for cross-referencing mirrored comments
- attachment-sync map table (`attachment_sync_map`) for cross-referencing mirrored attachments
- link uniqueness constraint per active Zendesk ticket in `sync_link`
- replay-safe ADO create and update logic (revision-based optimistic concurrency via `test` op on `/rev`)

### 14.3 Examples

- do not recreate an ADO item if a Zendesk ticket is already linked (check `sync_link`)
- do not mirror back a Zendesk comment that originally came from ADO (check integration marker in body)
- do not create repeated private notes for unchanged ADO state (compare fingerprint)
- do not process the same webhook event twice (check dedup key in `sync_event`)

## 15. Error Handling And Retry Design

### Retryable

- `429`
- selected `5xx`
- timeouts
- temporary network failures

Behavior:

- exponential backoff with jitter
- capped retry count
- audit each failure

### Non-Retryable Without Human Action

- `401`
- `403`
- validation errors
- field mapping mismatches
- missing required routing values

Behavior:

- mark failed
- raise operator-visible error
- stop automatic retries until corrected

## 16. Security And Identity Design

### Zendesk

V1 auth:

- admin-owned API token or dedicated integration admin account

### Azure DevOps

V1 auth:

- dedicated non-human integration identity
- PAT owned by that identity

Current client-requested access profile for the integration user:

- `Basic + Test Plans` or `Visual Studio Enterprise`
- `Project Collection Administrators`

### Oracle

V1 auth:

- dedicated schema credentials already provided for the `AUTOMATION` schema

### Secret Handling

- secrets must not live in source control
- secrets must be injected through host env files or secret mounts
- runtime logs must never print tokens or passwords

## 17. Observability And Operator Design

Required visibility:

- health endpoint for container/platform checks
- readiness endpoint for dependency-aware checks
- structured logs
- Oracle-backed audit log
- failure list for replay
- last successful sync timestamp per linked record

Minimum operator questions the system must answer:

- is the service up
- can it reach Zendesk, ADO, and Oracle
- what failed
- what is waiting to retry
- which Zendesk ticket is linked to which ADO item
- when each link last synchronized successfully

## 18. Deployment Assumptions For Design Purposes

This section is intentionally not the deployment plan, but it captures the design assumptions the deployment plan must honor.

Assumed live-host shape:

- stack directory under `/srv/stacks/zendesk-ado-sync`
- one container for the integration service
- loopback bind such as `127.0.0.1:<integration-port>`
- host-level `Caddy` site block for the chosen hostname
- Watchtower label enabled
- Oracle host mapping via `extra_hosts` if needed

## 19. Open Decisions Still Worth Locking

- final public hostname for the integration
- final production integration-user credentials in ADO
- whether attachment sync is full v1 or controlled pilot v1
- whether `BI` and `Reports` should route into `Vision Analytics` in v1
- whether multiple ADO links per Zendesk ticket are ever needed later
- whether a future sidebar app is required after pilot feedback

## 20. Build-Ready Conclusion

The design is now strong enough to move into implementation planning.

What is already solid:

- product goal
- standalone runtime shape
- host pattern
- Oracle persistence direction
- Zendesk field model
- ADO routing direction
- status and sprint behavior
- comment and note rules
- retry and audit model

What remains for the next phase:

- turn this design into an execution plan
- define the Oracle schema DDL
- define the service module boundaries
- define the exact Zendesk API asset-creation sequence
- define the exact live-host deployment package
