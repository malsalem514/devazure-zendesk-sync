# Zendesk Azure DevOps Integration Technical Specification

**Document Owner:** Musa Al Salem  
**Prepared On:** 2026-04-15  
**Status:** Discovery-backed draft  
**Project Type:** Standalone integration service  
**Audience:** Support Operations, Engineering, Delivery, Implementation Team

## 1. Purpose

This document translates the business requirements for a Zendesk to Azure DevOps integration into an implementation-ready technical specification.

It is based on:

- The business requirements received on 2026-04-15
- The current standalone starter service in this project
- The SOTA research and knowledge-gap review in [2026-04-15-zendesk-ado-sota-research-gap-analysis.md](../reports/2026-04-15-zendesk-ado-sota-research-gap-analysis.md)
- The consolidated solution design in [ZENDESK-ADO-FULL-SOLUTION-DESIGN.md](./ZENDESK-ADO-FULL-SOLUTION-DESIGN.md)
- Live tenant discovery performed against:
  - Zendesk: `https://jestaissupport.zendesk.com`
  - Azure DevOps: `https://dev.azure.com/jestaisinc`

## 2. Current Delivery Baseline

The current codebase is a safe one-way starter. It already supports:

- Secure Zendesk webhook intake
- Webhook signature verification
- Deterministic work item lookup by Zendesk ticket reference
- Azure DevOps work item create or update flow
- Dry-run mode for rollout safety

The business requirement is broader than the starter and requires:

- New Azure DevOps work item creation from Zendesk
- Linking to an existing Azure DevOps work item
- Bidirectional status synchronization
- Selective bidirectional comment synchronization
- Attachment transfer
- Retry handling and auditability
- Field and workflow mapping aligned to the client tenant

## 2.1 Deployment Direction

Current deployment direction:

- The integration remains a standalone service.
- It should be deployed as its own container on the client's existing Linux Docker host.
- It should live beside existing services such as `MyReports`, not inside the `MyReports` application codebase or runtime.
- It should reuse the host's existing reverse-proxy and container-management patterns where practical.

Live host validation on 2026-04-15 confirmed:

- target host: `ubuntu-docker-host` (`172.16.20.97`)
- OS: Ubuntu 24.04 LTS
- current reverse proxy: host-level `Caddy`
- current deployment root: `/srv/stacks`
- current `MyReports` stack: `/srv/stacks/myreports/docker-compose.yml`
- current `ERPNext` stack: `/srv/stacks/erpnext/docker-compose.yml`
- current `MyReports` publish model: loopback bind `127.0.0.1:3000 -> 3000`, then host-level reverse proxy

Practical implication:

- the integration should follow the current live-host pattern more closely than the older repo-level `Traefik` reference files
- a new integration stack should most likely be deployed under `/srv/stacks/<integration-name>`
- the integration container should bind to `127.0.0.1:<port>`
- `Caddy` should front the public webhook or app hostname and reverse-proxy it to that loopback port

## 2.2 Research-Backed Technology Direction

Current best-fit implementation stack:

- Node.js + TypeScript
- one dedicated HTTP integration service with raw-body access for Zendesk webhook verification
- Oracle for sync ledger, replay, audit, and operational queries
- Oracle-backed worker tables as the v1 worker pattern, using `SELECT FOR UPDATE SKIP LOCKED` for safe concurrent job claiming (Oracle 19c supports this natively)
- Oracle AQ or TxEventQ only if the DBA team later enables it for the integration schema (note: `oracledb` v6.10 now supports AQ in thin mode, so the upgrade path is clean)
- Dockerized deployment on the existing client Linux host

Confirmed package decisions (based on SOTA inventory — see `docs/reports/2026-04-16-sota-inventory-and-leverage-plan.md`):

- `oracledb` v6.10 in thin mode (no Oracle Instant Client needed) — copy pool + query pattern from `myreports/lib/oracle.ts`
- `node-zendesk` v6 for all outbound Zendesk API calls (ticket fields, comments, webhooks, triggers) — 65K+ weekly downloads, recommended by Zendesk's own docs, only actively maintained Node.js client
- `azure-devops-node-api` v15 for TypeScript type imports only (`import type`) — keep our hand-rolled fetch + Basic auth layer for actual API calls, because the SDK does not cover service hooks and its HTTP layer adds unnecessary complexity
- `node-cron` for scheduling worker polling and reconciliation runs
- No Zendesk webhook signature package (none exist; our `zendesk-signature.ts` is correct)
- No ADO service hook validation package (none exist; trivial HMAC-SHA1)
- Bidirectional sync follows the Truto.one 5-pillar pattern: origin tagging, fingerprint comparison, sync journal, composite dedup key, field ownership rules

What this means in practice:

- do not hand-roll retry state in memory or flat files
- do not add Redis just to obtain a queue if Oracle is already available
- do not promote Power Automate, Logic Apps, Workato, or a marketplace app to the primary production runtime
- do not introduce Temporal-class workflow infrastructure for v1 unless the scope expands materially
- do not replace our fetch-based ADO client with the full `azure-devops-node-api` runtime — the types are valuable, the HTTP layer is not
- do not build a Zendesk API client from scratch — `node-zendesk` covers all required operations

## 3. Confirmed Access And Permission Findings

### Zendesk

Confirmed API identity:

- User: `ndandashi@jestais.com`
- Name: `Nasser Dandashi`
- Role: `admin`

Confirmed accessible admin surfaces:

- Current user profile
- Ticket forms
- Ticket fields
- Custom statuses
- Trigger categories
- Triggers
- Webhooks
- Groups
- Views

Confirmed conclusion:

- No Zendesk permission gap was found for the integration surfaces needed to read configuration and operate an admin-managed webhook-driven integration.

Confirmed restriction:

- The Custom Roles API returned `402 Payment Required`.
- This appears to be a Zendesk plan or product entitlement limitation, not a user access problem.
- This does not block the integration itself.

### Azure DevOps

Confirmed CLI identity:

- User: `malsalem@jestais.com`
- Access level: `Basic`
- Organization: `jestaisinc`

Confirmed accessible surfaces:

- Organization and project listing
- Work item types
- Area paths
- Iteration paths
- Field metadata
- Validate-only work item creation

Confirmed conclusion:

- No core Azure DevOps permission gap was found for reading metadata or creating work items in the visible projects.

Live membership findings for `malsalem@jestais.com`:

- `[VisionSuite]\\Contributors`
- `[VisionSuite]\\Readers`
- `[VisionSuite]\\Webscopus`
- `[VisionSuite]\\Vision Store`
- `[Vision Analytics]\\Contributors`
- `[jestaisinc]\\Project Collection Administrators` (confirmed in a later live re-check on 2026-04-15)

Important permission finding:

- a direct extended-user read attempt still required `ReadExtended Users`
- a direct project-creation permission probe succeeded and created a temporary private project named `codex-access-check-delete-me`
- current conclusion: the working user now has confirmed collection-admin capability, even though the exact upgraded paid access tier was not cleanly readable from the CLI entitlement endpoint

Still unverified:

- Attachment upload permission
- Service hook create or manage permission
- Process administration or workflow customization rights

## 4. Live Tenant Findings

### Zendesk Configuration

Primary support form:

- Form: `Support`
- Form ID: `41831496024083`
- Active: `true`
- Default: `true`

Key Zendesk fields already present:

- `Subject` -> `39707448312595`
- `Description` -> `39707455642899`
- `Priority` -> `39707448314899`
- `Status` -> `39707455643155`
- `Ticket status` custom status field -> `39707455643923`
- `Case Type` -> `40990804522131`
- `CRF` -> `40992814161939`
- `Root Cause` -> `40992820632083`
- `ALT_ID` -> `41102444427411`
- `Dept` -> `41250295013395`
- `Org Name` -> `41539146831251`
- `Product` -> `41831367668115`
- `Product*` -> `42498755817491`
- `Developer` -> `42125267636499`
- `Scopus Case #` -> `41275842189459`

Existing custom statuses:

- `New`
- `Open`
- `In Progress`
- `Pending`
- `On-hold`
- `Code Completed`
- `On-hold - Workaround provided`
- `Solved`

Important observation:

- The tenant already has some statuses close to the BRD intent, but not all of the exact labels requested in the BRD.
- `Code Completed` already exists and may be reusable instead of creating a new `Dev Completed` or `Support Ready` status.

Existing outbound integration pattern:

- A live webhook already exists for a Scopus integration.
- Existing triggers send ticket data to that webhook for selected ticket forms.
- This confirms that webhook-driven outbound automation is already operational in the tenant.

Design implication:

- The Azure DevOps integration should be introduced as a separate webhook and trigger set first.
- It should not replace or overload the Scopus integration until coexistence rules are explicitly approved.

Relevant Zendesk groups discovered:

- `Base Dev`
- `DBA`
- `Delivery`
- `Professional Services`
- `Support | Financials`
- `Customer Success`

These groups may become routing inputs for work item assignment or area-path selection.

### Azure DevOps Configuration

Confirmed visible projects:

- `VisionSuite`
- `Vision Analytics`

Confirmed required fields for `Task` creation:

- `System.Title`
- `Custom.Bucket`
- `Custom.Unplanned`

Confirmed additional required field for `Bug` and `User Story`:

- `Microsoft.VSTS.Common.ValueArea`

Confirmed valid `Custom.Bucket` values:

- `Admin`
- `Client`
- `Demo`
- `Internal`
- `Release`
- `Roadmap`
- `Support`
- `Technical Debt`
- `Training`

Confirmed minimal create patterns:

- `Task` can be validated with:
  - `System.Title`
  - `Custom.Bucket=Support`
  - `Custom.Unplanned=true`
- `Bug` and `User Story` can be validated with:
  - `System.Title`
  - `Custom.Bucket=Support`
  - `Custom.Unplanned=true`
  - `Microsoft.VSTS.Common.ValueArea=Business`

Confirmed important custom fields:

- `Custom.Client` is a picklist
- `Custom.Product` is a picklist
- `Custom.Status` is a picklist
- `Custom.CRF` is a text field
- `Custom.XREF` is a text field

Confirmed Azure DevOps status values in `VisionSuite` custom status field:

- `New`
- `Backlog`
- `Active`
- `In Development`
- `In Testing`
- `Completed`
- `Closed`
- `Waiting on Analysis/Review`
- `Waiting on Development`
- `Waiting on Testing`

Important observation:

- Azure DevOps has enough existing custom fields to support the BRD without requiring a greenfield work item schema.
- The main work is field crosswalk design, not tenant capability enablement.
- The `VisionSuite` iteration hierarchy exposes concrete sprint `startDate` and `finishDate` values, so sprint timing can be synchronized into Zendesk without inference when a work item has an iteration path assigned.

## 5. Draft Source Of Record Rules

Recommended system ownership:

- Zendesk owns customer-facing ticket context
- Zendesk owns support-entered business context
- Zendesk owns support workflow status
- Azure DevOps owns engineering execution state
- Azure DevOps owns sprint assignment and delivery dates

Recommended per-field ownership:

| Concern | System Of Record | Notes |
| --- | --- | --- |
| Ticket subject | Zendesk | Sync to Azure DevOps title on create and selected updates |
| Customer issue description | Zendesk | Include structured support notes in work item description |
| Troubleshooting and repro steps | Zendesk | Sync to work item description or dedicated comment block |
| Acceptance criteria | Zendesk | Sync to work item description |
| Priority / urgency | Zendesk | Zendesk should win on conflicts unless otherwise approved |
| Support workflow status | Zendesk | Preserve support queue behavior and existing Zendesk automations |
| Engineering state | Azure DevOps | Sync summarized state back to Zendesk |
| Sprint / target date | Azure DevOps | Used to update Zendesk expected turnaround |
| Developer discussion | Azure DevOps | Sync back to Zendesk as internal note |
| Customer-visible reply | Zendesk | Sync into Azure DevOps discussion |

## 6. Recommended Zendesk Integration Fields

Recommended machine-owned Zendesk fields:

| Zendesk Field | Purpose | Ownership |
| --- | --- | --- |
| `ADO Status` | Read-only engineering state shown to support agents | Integration-owned |
| `ADO Status Detail` | Richer support-friendly engineering explanation | Integration-owned |
| `ADO Sprint` | Current Azure DevOps sprint or iteration name | Integration-owned |
| `ADO Sprint Start` | Sprint start date from Azure DevOps iteration metadata | Integration-owned |
| `ADO Sprint End` | Sprint end date from Azure DevOps iteration metadata | Integration-owned |
| `ADO ETA` | Current expected engineering delivery date | Integration-owned |
| `ADO Work Item ID` | Reference to the linked Azure DevOps work item | Integration-owned |
| `ADO Work Item URL` | Deep link for agents and reporting | Integration-owned |
| `ADO Last Sync At` | Timestamp of last successful sync | Integration-owned |
| `ADO Sync Health` | `ok`, `warning`, `error`, or similar integration state | Integration-owned |

Recommended UX rule:

- These fields should be treated as integration-managed, not manually maintained by agents.
- If Zendesk cannot reliably enforce agent read-only behavior for the chosen field type and plan, the authoritative display should live in a Zendesk sidebar app while the fields remain present for reporting and automation.

Recommended description strategy:

- Do not use a single long text field as the running engineering history.
- On escalation, write a structured support snapshot into the Azure DevOps work item description.
- For ongoing updates, add selected Azure DevOps changes back to Zendesk as private notes.
- Do not add a rolling summary field in v1; use private notes for detailed update history.

## 7. Draft Field Mapping Table

| Zendesk Source | Azure DevOps Target | Draft Rule |
| --- | --- | --- |
| Ticket ID | `System.Tags` and/or dedicated reference field | Preserve deterministic link such as `zendesk:id:<ticket-id>` |
| Subject | `System.Title` | Direct map |
| Description + Issue Detail + Repro Steps + Acceptance Criteria | `System.Description` | Compose a structured HTML or markdown summary |
| Priority | `Microsoft.VSTS.Common.Priority` | Requires explicit numeric mapping table |
| Case Type | Work item type | `Defect -> Bug`, `Enhancement Request -> User Story`, `Training Request -> Task`, `Data Fix -> Task or Bug`, `Other -> Task` |
| Org Name | ADO description + guarded `Custom.Client` | Preserve the Zendesk org name in the structured description; write `Custom.Client` only when the value exactly matches the approved ADO client picklist |
| Product* | ADO route + `Custom.Product` | Use the active high-level family value for routing; detailed Product can refine `Custom.Product` later after an approved crosswalk |
| CRF | `Custom.CRF` | Direct text map |
| ALT_ID or Scopus reference | `Custom.XREF` | Candidate mapping; needs business approval |
| Developer | `System.AssignedTo` | Only if value normalization to ADO identity is reliable |
| Zendesk status summary | `Custom.Status` or comments | Use only if business wants mirrored support-facing state in ADO |
| Ticket URL | Hyperlink relation | Add backlink for traceability |

Recommended reverse maps from Azure DevOps into Zendesk:

| Azure DevOps Source | Zendesk Target | Draft Rule |
| --- | --- | --- |
| Work item ID | `ADO Work Item ID` | Direct map |
| Work item URL | `ADO Work Item URL` | Direct map |
| Work item state or mapped engineering stage | `ADO Status` | Normalize to support-friendly labels |
| Work item state plus sprint context | `ADO Status Detail` | Generate richer agent-facing text such as `In testing in Sprint 112 (Apr 18 - Apr 24)` |
| Iteration path | `ADO Sprint` | Store the sprint or iteration display name |
| Iteration start date | `ADO Sprint Start` | Populate when iteration metadata has `startDate` |
| Iteration finish date | `ADO Sprint End` | Populate when iteration metadata has `finishDate` |
| Iteration finish date or explicit target date | `ADO ETA` | Prefer target date, else sprint finish date |
| Last successful sync timestamp | `ADO Last Sync At` | Integration timestamp |
| Integration health classification | `ADO Sync Health` | `ok`, `warning`, `error` |

Required Azure DevOps defaults if not explicitly mapped by business rule:

- `Custom.Bucket = Support`
- `Custom.Unplanned = true`
- `Microsoft.VSTS.Common.ValueArea = Business` for `Bug` and `User Story`

## 8. Draft Status Transition Logic

The BRD intent is achievable, but the exact labels should be normalized before implementation.

Recommended status design:

- Keep Zendesk native status and custom status focused on support workflow.
- Use the new Zendesk `ADO Status` field for engineering workflow visibility.
- This avoids breaking existing Zendesk queue logic while still giving agents a reliable development-state signal.

Recommended first-pass transition logic:

| Azure DevOps Condition | Zendesk `ADO Status` | Zendesk support status impact |
| --- | --- | --- |
| Work item in backlog or `New`, with no sprint | `In Dev Backlog` | Clear `ADO Sprint`, `ADO Sprint Start`, and `ADO Sprint End`; no automatic support-status change by default |
| Work item assigned to sprint or active dev state | `Dev In Progress` | Populate sprint name and dates; BRD rule treats sprint assignment as development in progress |
| Work item completed by engineering | `Support Ready` or `Code Completed` | Preserve last sprint data for context; optional `ZENDESK_DEV_COMPLETED_STATUS_ID` can move native Zendesk custom status after support approval |

Recommended implementation rule:

- Avoid changing Zendesk native status automatically unless the support operations team explicitly approves each transition and provides the live `Dev Completed` custom status id.
- Prefer syncing engineering progress into `ADO Status` first.

## 9. Comment Synchronization Policy

Recommended policy:

- Zendesk public replies -> Azure DevOps discussion comments
- Zendesk private notes -> do not sync by default
- Zendesk private notes tagged with `#sync` -> Azure DevOps discussion comment
- Azure DevOps discussion comments -> Zendesk internal notes, bounded by a configurable recent-comment window

Recommended guardrails:

- Tag every mirrored comment with an integration marker
- Ignore comments already stamped by the integration
- Persist comment IDs in `COMMENT_SYNC_MAP` so retries and reconciler passes do not duplicate notes
- Preserve author, timestamp, and origin system in the mirrored body
- Preserve the acting Zendesk sidebar user in ADO discussions, Zendesk internal notes, and audit summaries for create/link/unlink/comment actions initiated from the sidebar
- Gate inbound `ticket.comment_added` events by approved Zendesk form before persisting or enqueueing work
- Require an active `SYNC_LINK` row before processing comment-added sync; unlinked comment events should no-op without querying ADO
- Keep Zendesk trigger payloads compact and hydrate latest comment text, visibility, and attachments from the Zendesk Comments API to avoid brittle Liquid JSON escaping

## 10. Attachment Synchronization Policy

Recommended policy:

- Sync Zendesk attachments that appear on escalated comments or ticket creation payloads
- Upload files to Azure DevOps as attachments and link them to the work item
- Enforce `SYNC_MAX_ATTACHMENT_BYTES` and skip oversized files instead of blocking the iframe
- Persist attachment IDs in `ATTACHMENT_SYNC_MAP` so retries do not duplicate ADO attachments
- Download only HTTPS attachment URLs from the configured Zendesk tenant host or Zendesk content CDN (`*.zdusercontent.com`)
- Follow attachment redirects manually and re-validate every redirect target before downloading

Open verification item:

- Run one live attachment smoke test with the integration PAT before declaring attachment sync production-ready.

## 11. Triggering Strategy

Recommended Zendesk to Azure DevOps trigger rules:

- Run only for approved forms such as `Support`
- Run only when explicit escalation criteria are met
- Prefer a dedicated integration tag such as `ado_escalation`
- Optionally allow automatic escalation for high-priority tickets after approval
- Treat Zendesk webhook/event-subscription filters as an optimization only; the integration service must repeat the approved-form scope check before enqueueing any work
- Keep comment webhooks link-aware so ordinary comments on non-escalated tickets do not generate ADO traffic

Recommended Azure DevOps to Zendesk trigger rules:

- Use service hooks or polling for work item updates
- Sync only state, sprint, selected comments, and selected attachments
- Ignore updates authored by the integration identity to prevent loops

Recommended transport design:

- Use Azure DevOps service hooks for near-real-time work item change events.
- Add a scheduled reconciliation pass to refresh ETA and recover from missed or failed events.
- This is important because ETA often depends on iteration metadata and not only on the latest work item update event.

Recommended sprint-display rule:

- If an Azure DevOps work item has a valid iteration with dates, show `ADO Sprint`, `ADO Sprint Start`, and `ADO Sprint End` in Zendesk.
- If the work item is not assigned to a dated sprint, leave those fields blank and keep `ADO Status` as `In Dev Backlog` or another non-sprint state.
- `ADO ETA` should usually mirror `ADO Sprint End` unless the client has a stronger target-date field they want to trust first.

## 12. Error Handling And Retry

Required resilience behavior:

- Exponential backoff for transient failures
- Retry classification by error family
- Manual retry path for failed sync records
- Audit log entry for every automated create, update, comment sync, and attachment sync
- Immediate alert on authentication failure

Recommended retry policy:

- `429` and selected `5xx`: exponential backoff with jitter
- `401` and `403`: stop automatic retry and alert administrator
- Validation failures: mark as configuration error and require human correction

Recommended implementation shape:

- persist every inbound sync event and planned outbound action in Oracle
- execute retries and reconciliation through Oracle-backed worker tables using `SELECT FOR UPDATE SKIP LOCKED` for safe concurrent claiming
- keep a replayable sync ledger so failed events can be retried safely after configuration fixes
- expose minimal operator tooling for replay and failure inspection
- protect operator tooling with `INTERNAL_ADMIN_TOKEN`; expose `GET /internal/jobs/dead` and `POST /internal/jobs/:id/retry`
- send optional webhook alerts through `SYNC_ADMIN_ALERT_WEBHOOK_URL` for non-retryable authentication failures
- follow the hookdeck webhook handler pattern: verify signature → parse → check dedup → return 2xx immediately → process asynchronously via job queue
- dedup TTL on inbound events must exceed the upstream retry window (Zendesk retries for ~48 hours)

## 13. Security Model

Recommended production identities:

- Dedicated Zendesk integration identity or admin-owned token
- Dedicated Azure DevOps service identity or PAT owned by a non-human integration account

Current client-requested Azure DevOps integration-user target:

- access level: `Basic + Test Plans` or `Visual Studio Enterprise`
- role: `Project Collection Administrators`

Why this matters:

- this exceeds the minimum runtime sync requirement
- it is being requested to support future provisioning work such as project creation, user-related automation, and test-plan access
- implementation should treat this as an explicit client access decision

Security requirements:

- TLS 1.2 or higher for all transport
- Secrets stored outside source control
- Integration-authored changes clearly identifiable in both systems
- Audit log retention aligned to client compliance expectations
- Attachment fetches must be host allow-listed to prevent SSRF and credential leakage

Authentication direction:

- Zendesk API token is acceptable for v1 because this is a client-owned internal integration
- Zendesk OAuth remains a valid future upgrade path if the client wants refresh-token governance
- avoid legacy Azure DevOps OAuth for new implementation work
- avoid global Azure DevOps PATs
- for v1, the practical recommendation is an organization-scoped Azure DevOps PAT owned by a dedicated non-human integration identity
- the target-state Azure DevOps auth model should be Microsoft Entra if the client wants stronger governance and lifecycle management

## 13.1 Minimal Operational Surface

Recommended non-UI operational endpoints or capabilities:

- health check endpoint
- readiness check endpoint
- failed-sync inspection by correlation ID or ticket/work item reference
- manual replay action for retriable failures
- audit query surface for recent sync actions

This should stay minimal in v1, but it must exist so the integration is supportable after go-live.

## 13.2 Oracle-Specific Runtime Notes

Confirmed Oracle integration path:

- use `oracledb` v6.10 in **thin mode** (pure JavaScript, no Oracle Instant Client libraries needed)
- copy the connection pool + query helper pattern from `myreports/lib/oracle.ts` (lazy singleton pool, `query<T>()`, `execute()`, `executeMany()`, `safeExecuteDDL()`)
- connect string format: `srv-db-100/SUPPOPS` (host/service)
- v1 uses Oracle-backed worker tables with `SELECT FOR UPDATE SKIP LOCKED` for safe concurrent job claiming
- Oracle AQ in thin mode is now supported by `oracledb` v6.10 — this is a clean future upgrade path if the DBA team enables `DBMS_AQADM`

Worker table claiming pattern (confirmed working on Oracle 19c):

- `SELECT ... WHERE status='PENDING' AND next_process_at<=SYSTIMESTAMP FOR UPDATE SKIP LOCKED` to claim jobs
- **Important caveat:** do NOT combine `FETCH FIRST N ROWS ONLY` or `ROWNUM` with `FOR UPDATE SKIP LOCKED` — Oracle evaluates the row limit before checking locks. Use cursor fetch-one or `oracledb`'s `maxRows` option instead.
- Exponential backoff: `next_process_at = SYSTIMESTAMP + NUMTODSINTERVAL(LEAST(POWER(2, attempt_count) + DBMS_RANDOM.VALUE(0, 1), 3600), 'SECOND')`
- Stale job recovery: periodic sweep resets jobs stuck in `PROCESSING` beyond a timeout back to `PENDING`
- Deduplication: `dedup_key` column with UNIQUE index; use `MERGE INTO` or catch `ORA-00001`
- Reference architecture: yoomoney/db-queue (Java, 252 stars, explicit Oracle support)

Operational notes:

- Oracle host resolution needs Docker `extra_hosts` mapping (e.g., `srv-db-100:172.16.25.63`) on the target Linux host
- `UV_THREADPOOL_SIZE` should be set >= `poolMax` (Node.js default is 4 threads)
- Always release connections in `finally` blocks
- Set `oracledb.autoCommit = true` globally; use explicit transactions only for claim-execute-complete sequences

Live Oracle validation findings from 2026-04-15:

- `srv-db-100` resolved over VPN to `172.16.25.63`
- the `SUPPOPS` database is reachable
- the `AUTOMATION` schema authenticates successfully
- database version is `Oracle Database 19c Standard Edition 2`
- the schema has core object-creation capabilities such as `CREATE TABLE`, `CREATE VIEW`, `CREATE SEQUENCE`, `CREATE PROCEDURE`, `CREATE TRIGGER`, `CREATE TYPE`, and `CREATE JOB`
- Oracle queue catalog views are present, but no user queues are configured in the `AUTOMATION` schema
- `DBMS_AQADM` is not currently callable from the `AUTOMATION` schema

Live connectivity re-validated on 2026-04-16:

- `oracledb` thin mode connection from local dev machine to `automation@srv-db-100/SUPPOPS` confirmed working
- `SELECT 1 FROM DUAL` returned successfully

Current implementation implication:

- Oracle-backed worker tables with `SKIP LOCKED` are the confirmed v1 path
- AQ is a later enhancement — the upgrade path is clean since `oracledb` 6.10 supports AQ in thin mode

## 14. Recommended Agent Experience

Recommended ticket experience:

- Agents create or link an Azure DevOps work item from Zendesk.
- New items should create as `Bug` by default in v1 unless an approved routing rule selects a different work item type.
- Linking should accept either a numeric Azure DevOps work item ID or a full Azure DevOps work item URL.
- Relinking should be allowed, but it must generate a Zendesk internal audit note that records the previous and new work item reference.
- The preferred v1 UX is a small private Zendesk ticket sidebar app from day 1.
- The visible v1 flow is:
  - `Create new ADO`
  - `Link existing ADO`
  - current linked item and support-friendly engineering status in the sidebar
  - existing `Dev Funnel #` optionally populated as a familiar visible reference after success
- During development and pilot, the app should be visible only on the designated pilot form `Musa ADO Form Testing` (`50882600373907`), then expanded later at go-live if approved.
- Agents receive significant engineering updates as internal notes.
- Engineers continue working in Azure DevOps without needing to mirror every support operation.

Recommended UI pattern:

- Use Zendesk ticket fields for stored reporting values.
- Use the sidebar app as the primary create/link/status UI in v1.
- Use private notes for audit and significant updates.
- Keep the machine-owned `ADO *` fields off the normal support form unless testing, operator workflows, or reporting require them.
- Avoid a native-field-first rollout so the client only needs one training and one change-management pass.

## 15. Open Decisions Before Full Implementation

- Confirm whether the client-facing name should use `Azure DevOps`, `ADO`, or `DevAzure`
- Approve the exact Zendesk escalation tag and trigger conditions
- Approve the `Case Type -> Work Item Type` mapping
- Approve `Org Name -> Client` and `Product -> Product` crosswalk tables
- Approve the final `ADO Status` label set
- Decide whether `Developer` should map to `System.AssignedTo`
- Decide whether `ADO ETA` should prefer target date, sprint finish date, or a fallback hierarchy
- Decide whether the new integration coexists with Scopus or eventually replaces part of that flow
- Ask Azure DevOps IT to provision the dedicated integration identity with:
  - `Basic + Test Plans` or `Visual Studio Enterprise`
  - `Project Collection Administrators`
- Confirm whether Azure DevOps service hooks can be created in the target project
- Confirm Azure DevOps attachment upload permission
- Confirm Oracle schema availability, credentials, and network reachability from the target Linux host
- Decide whether AQ should stay a later enhancement and explicitly lock Oracle-backed worker tables for v1
- Confirm whether v1 supports one primary linked work item or multiple linked work items per Zendesk ticket

## 16. Recommended Next Build Steps

1. Confirm Oracle schema access and lock Oracle-backed worker tables as the default v1 worker model unless DBA enablement changes.
2. Ask Azure DevOps IT to provision the elevated integration identity and return the account details.
3. Confirm the Azure DevOps auth path for that identity and capture credentials securely.
4. Finalize the field crosswalk table with business-approved values.
5. Create the new Zendesk integration-owned fields, starting with `ADO Status`, `ADO Status Detail`, and `ADO ETA`.
6. Add sprint visibility fields: `ADO Sprint`, `ADO Sprint Start`, and `ADO Sprint End`.
7. Finalize the status matrix using the existing Zendesk and Azure DevOps tenant vocabulary.
8. Start the first agent-facing release on the private Zendesk sidebar app package and use fields plus private notes as storage and audit plumbing behind it.
9. Add an integration ledger for idempotency, retries, manual replay, and audit.
10. Implement Zendesk to Azure DevOps create and update using the confirmed required ADO fields.
11. Add reverse synchronization for `ADO Status`, `ADO Status Detail`, sprint fields, `ADO ETA`, and significant internal updates.
12. Add selective comment and attachment syncing with loop prevention.
13. Validate end-to-end behavior in a sandbox or pilot project before production rollout.
