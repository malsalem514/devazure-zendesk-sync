# Zendesk Azure DevOps Integration Solution Summary

**Status:** Historical working draft  
**Prepared On:** 2026-04-15  
**Purpose:** Capture what has been confirmed, what has been decided, and what is still open for design.

> Historical note: this summary remains useful for early discovery facts, but its old UI and rollout decisions are superseded by the current canonical docs. In particular, the sidebar app is now a phase-1 deliverable, not a phase-2 fallback. Use these documents for current implementation work:
>
> - [ZENDESK-AZURE-DEVOPS-INTEGRATION-TECHNICAL-SPEC.md](./ZENDESK-AZURE-DEVOPS-INTEGRATION-TECHNICAL-SPEC.md)
> - [ZENDESK-ADO-V1-FIELD-DEFINITIONS.md](./ZENDESK-ADO-V1-FIELD-DEFINITIONS.md)
> - [ZENDESK-SIDEBAR-APP-IMPLEMENTATION-SPEC.md](./ZENDESK-SIDEBAR-APP-IMPLEMENTATION-SPEC.md)

Primary detailed design reference:

- [ZENDESK-ADO-FULL-SOLUTION-DESIGN.md](./ZENDESK-ADO-FULL-SOLUTION-DESIGN.md)

## 1. Current Goal

Build a client-deliverable integration that lets support agents:

- create an Azure DevOps issue from Zendesk
- link a Zendesk ticket to an existing Azure DevOps work item
- monitor engineering status from Zendesk
- monitor sprint assignment and sprint dates from Zendesk
- track ETA from Zendesk without depending on manual engineering updates

## 2. What Has Been Confirmed

### Tenant Access

- Zendesk admin API access is working for `ndandashi@jestais.com`.
- Azure DevOps access is working for `malsalem@jestais.com`.
- No core permission blocker has been found yet for:
  - reading Zendesk configuration
  - creating or updating Azure DevOps work items
  - reading Azure DevOps area paths, iteration paths, and field metadata

### Zendesk Facts

- The primary support form is `Support` with form ID `41831496024083`.
- Zendesk already has custom statuses such as:
  - `In Progress`
  - `Code Completed`
- Zendesk already has an outbound integration pattern in place for Scopus via webhook and triggers.
- Current Zendesk fields are agent-editable in the tenant data we inspected.

### Azure DevOps Facts

- Visible projects include `VisionSuite` and `Vision Analytics`.
- Azure DevOps work item creation requires at least:
  - `System.Title`
  - `Custom.Bucket`
  - `Custom.Unplanned`
- `Bug` and `User Story` also require `Microsoft.VSTS.Common.ValueArea`.
- `VisionSuite` iteration nodes include real sprint `startDate` and `finishDate` values.
- The current interactive Azure DevOps user `malsalem@jestais.com` has `Basic` access.
- Live membership checks show that user in:
  - `[VisionSuite]\\Contributors`
  - `[VisionSuite]\\Readers`
  - `[VisionSuite]\\Webscopus`
  - `[VisionSuite]\\Vision Store`
  - `[Vision Analytics]\\Contributors`
- A later live membership re-check on 2026-04-15 showed that user is now also in:
  - `[jestaisinc]\\Project Collection Administrators`
- A direct project-creation permission probe succeeded and created a temporary private project named `codex-access-check-delete-me`.
- The Azure DevOps extended-user entitlement endpoint still did not provide a clean access-level read in CLI, so the latest group-admin upgrade is confirmed more strongly than the exact current paid access level.

### Area Path Facts

Current area-path inventory observed:

- `VisionSuite` has 43 area-path nodes.
- `Vision Analytics` currently has a minimal area tree with:
  - `\\Vision Analytics\\Area`
  - `\\Vision Analytics\\Area\\Vision Analytics`

Notable `VisionSuite` area paths:

- `\\VisionSuite\\Area\\Vision Merchandising and WMS`
- `\\VisionSuite\\Area\\Vision Central Portal`
- `\\VisionSuite\\Area\\Vision Store`
- `\\VisionSuite\\Area\\Vision Financials`
- `\\VisionSuite\\Area\\Vision SnD`
- `\\VisionSuite\\Area\\Vision Unified Omni`
- `\\VisionSuite\\Area\\Vision Analytics BI Team`
- `\\VisionSuite\\Area\\Vision Mobile`
- `\\VisionSuite\\Area\\Omni POS Mobile Funnel`
- `\\VisionSuite\\Area\\Delivery Funnel`
- `\\VisionSuite\\Area\\SnD Funnel`
- `\\VisionSuite\\Area\\Merch Plus Funnel`
- `\\VisionSuite\\Area\\Merch WMS VCP Financial - Funnel`
- `\\VisionSuite\\Area\\Vision Factory Label Printing`
- `\\VisionSuite\\Area\\Vision Attribute Center`
- `\\VisionSuite\\Area\\Vision Close Out Tool`
- `\\VisionSuite\\Area\\Vision Discount Policy`
- `\\VisionSuite\\Area\\Vision Marketing SCI Creator`
- `\\VisionSuite\\Area\\Vision Product Desc Editor`
- `\\VisionSuite\\Area\\Vision Schema Express`
- `\\VisionSuite\\Area\\Vision SPILink`

Important observation:

- The area-path tree is broader than what should likely be exposed as direct Zendesk routing choices in v1.
- Some area paths represent product domains.
- Some represent delivery funnels.
- Some are review, team, AI, or operational buckets that should probably not be default support-routing targets.

### Sample Work Item Facts

Reference examples reviewed on 2026-04-15:

- `69491`
- `78768`
- `79267`
- `77931`
- `79443`

Observed pattern from those examples:

- All five examples are `Bug` work items in `VisionSuite`.
- All five use area path `VisionSuite\\Omni POS Mobile Funnel`.
- All five use iteration path `VisionSuite\\Omni POS Mobile Funnel`.
- That iteration node has no `startDate` or `finishDate`, so these examples are not currently assigned to dated sprints.
- Four of the five use `Custom.Bucket = Support`.
- One example uses `Custom.Bucket = Client`.
- `Custom.Client` and `Custom.Product` are populated consistently enough to be important creation targets.
- `Custom.CRF` and `Custom.XREF` are used inconsistently and should be treated as optional mappings unless business rules tighten.
- Some examples have parent links, and a resolved example has build, commit, and pull-request artifact links.

### Existing Infrastructure Facts

- The current likely deployment target is an existing Linux Docker host.
- A live host inspection on 2026-04-15 confirmed the target host is:
  - hostname `ubuntu-docker-host`
  - IP `172.16.20.97`
  - Ubuntu 24.04 LTS
  - Docker-based
- `MyReports` is already deployed as a Dockerized production service with health checks, scheduler support, and shared reverse-proxy routing patterns.
- The live host is using host-level `Caddy`, not `Traefik`, as the active reverse proxy.
- `MyReports` is currently deployed from `/srv/stacks/myreports/docker-compose.yml`.
- `ERPNext` is currently deployed from `/srv/stacks/erpnext/docker-compose.yml`.
- `MyReports` currently runs as:
  - container `myreports`
  - host binding `127.0.0.1:3000 -> 3000`
  - Docker project/network family `myreports_default`
  - auto-update label enabled for Watchtower
- `Watchtower` is running on the same stack and currently manages labeled container updates from the same Docker network family.
- Host-level Caddy currently reverse-proxies:
  - `myreports.jestais.com` -> `127.0.0.1:3000`
  - `myprojects.jestais.com` -> `127.0.0.1:8090`
- `MyReports` already uses `node-oracledb`, so Oracle connectivity is not a new technology pattern on this host family.
- The current Oracle host naming pattern may rely on Docker `extra_hosts` or internal host mapping rather than public DNS resolution.
- `MyReports` is a good infrastructure neighbor for this integration, but not a good functional home for the integration logic itself.
- Older Windows deployment notes are now considered stale and should not drive the new architecture.
- The old repo-level `Traefik` combined-compose pattern remains useful as a reference, but it does not reflect the currently active reverse-proxy implementation on the live host.

### Oracle Facts

Live Oracle validation on 2026-04-15 confirmed:

- VPN-enabled host resolution for `srv-db-100` is working
- `srv-db-100.jestais.local` resolved to `172.16.25.63`
- the `SUPPOPS` database is reachable from the current environment
- the target schema authenticates successfully as `AUTOMATION`
- database version is `Oracle Database 19c Standard Edition 2`

Confirmed `AUTOMATION` schema capabilities include:

- `CREATE SESSION`
- `CREATE TABLE`
- `CREATE VIEW`
- `CREATE SEQUENCE`
- `CREATE PROCEDURE`
- `CREATE TRIGGER`
- `CREATE TYPE`
- `CREATE JOB`

Confirmed AQ-related findings:

- Oracle queue catalog views are present
- no user queues are currently configured in the `AUTOMATION` schema
- `DBMS_AQADM` is not currently callable from the `AUTOMATION` schema

Current implication:

- Oracle-backed worker tables are the most realistic v1 default unless the DBA team explicitly enables AQ for the integration schema

## 3. Decisions We Have Made

## Decision A: The integration will be standalone

We will deliver the Zendesk-Azure DevOps integration as a standalone client-owned service.

We will not:

- tie it to MusaOS branding or runtime
- make it depend on MyReports application code
- bury the integration inside an unrelated reporting product

## Decision B: It will run on the existing Docker host, but as its own service

The integration should run as a separate container on the same Linux Docker host that already runs `MyReports` and other services.

Recommended deployment shape:

- one dedicated container for the integration API and worker
- its own compose stack under `/srv/stacks/<integration-name>`
- host binding to loopback only, following the existing `MyReports` pattern
- one new host-level `Caddy` site block that reverse-proxies the integration endpoint to the local container port
- separate environment variables, logs, health check, and deployment lifecycle

We are explicitly not choosing:

- patching the MyReports codebase to own this integration
- installing it as a manual script on the host without container boundaries

## Decision C: Zendesk support status and ADO engineering status stay separate

Zendesk native status remains the support workflow status.

Azure DevOps engineering progress will be exposed through separate Zendesk integration-owned fields, starting with:

- `ADO Status`
- `ADO Status Detail`
- `ADO Sprint`
- `ADO Sprint Start`
- `ADO Sprint End`
- `ADO ETA`
- `ADO Work Item ID`
- `ADO Work Item URL`
- `ADO Last Sync At`
- `ADO Sync Health`

This avoids breaking Zendesk queue logic and gives agents a clean engineering signal.

## Decision D: Sprint visibility is a first-class requirement

If an Azure DevOps work item is assigned to a sprint, the integration should show:

- sprint name
- sprint start date
- sprint end date

If the work item is not assigned to a dated sprint:

- sprint fields remain blank
- `ADO Status` should reflect a non-sprint state such as `In Dev Backlog`

## Decision E: ETA should come from Azure DevOps planning data

Default ETA rule:

- prefer a stronger explicit engineering target date if the client has one
- otherwise use the Azure DevOps sprint end date
- otherwise show no ETA

## Decision F: Description and notes should be structured, not dumped into one field

On Zendesk escalation to Azure DevOps:

- the integration should write a structured summary into the Azure DevOps work item description

During lifecycle updates:

- meaningful Azure DevOps updates should come back to Zendesk as private notes

We are not choosing:

- one giant free-text Zendesk field as the running engineering history

## Decision G: Event-driven sync plus reconciliation

The integration should use both:

- webhook and service-hook style event handling for near-real-time updates
- a scheduled reconciliation job for retry, recovery, and sprint/ETA refresh

This is important because sprint timing comes from iteration metadata, not only from raw work item update events.

## Decision H: Existing Scopus integration should coexist for now

The new Azure DevOps integration should be introduced beside the Scopus pattern, not by replacing it immediately.

That means:

- new webhook
- new trigger set
- explicit coexistence rules

## Decision I: The implementation stack is now research-backed

The current best-fit production stack is:

- Node.js + TypeScript
- one dedicated HTTP service with raw-body handling for Zendesk signature verification
- Oracle for sync ledger, audit, and admin queries, using the client’s existing database estate
- Oracle-backed worker tables as the likely v1 pattern
- Oracle-native queueing only if the DBA team later enables AQ for the integration schema
- Zendesk fields plus private notes as storage and audit plumbing in v1
- a small Zendesk sidebar app as the approved phase-1 create/link/status UX

This keeps the service standalone, operationally simple, and aligned with the existing starter while avoiding unnecessary new infrastructure.

## Decision J: We will reuse proven primitives instead of inventing every layer

We should directly leverage:

- Zendesk webhooks
- Zendesk ticket sidebar patterns if needed later
- Azure DevOps service hooks
- Azure DevOps comments and attachments APIs
- Azure DevOps classification node APIs for sprint dates
- a battle-tested durable worker pattern rather than hand-built retry loops
- Oracle AQ or TxEventQ if the DBA team later provisions it

We are explicitly not choosing as the primary production base:

- a marketplace app as the delivered product
- Workato, Logic Apps, or Power Automate as the main runtime
- Redis just to get a queue if Oracle already exists and is approved
- Temporal-level workflow infrastructure for v1
- legacy Azure DevOps OAuth
- global Azure DevOps PATs

## Decision K: The v1 agent workflow is now defined

The current approved v1 workflow is:

- agents can create a new ADO item from Zendesk
- agents can link an existing ADO item using either an ADO ID or full ADO URL
- new Zendesk escalations should create `Bug` by default unless later routing rules override the work item type
- relinking is allowed, but the integration must leave an internal audit note showing the old and new link
- v1 uses the sidebar app as the primary agent experience, with fields plus private notes as storage and audit plumbing behind it
- the sidebar app is no longer a phase-2 fallback

## Decision L: The Azure DevOps integration identity will be provisioned with elevated admin capability

The current approved Azure DevOps provisioning request for the dedicated integration identity is:

- access level: `Basic + Test Plans` or `Visual Studio Enterprise`
- role: `Project Collection Administrators`

Why this was requested:

- the current project needs runtime integration access now
- the future roadmap may require project creation, user-related provisioning work, and test-plan operations

Important implementation note:

- this is broader than the minimum required for the runtime sync alone
- the request should therefore be treated as a deliberate client access decision, not an accidental default

## 4. Recommended v1 Architecture

```text
Zendesk trigger/webhook
  -> Zendesk-ADO integration service
  -> create or update Azure DevOps work item

Azure DevOps service hook
  -> Zendesk-ADO integration service
  -> update Zendesk ADO fields and add internal notes

Scheduled reconciler
  -> refresh work item state, sprint, ETA, retries, and failed events
```

Core components:

- inbound webhook receiver
- Azure DevOps client
- Zendesk client
- sync planner and mapping layer
- retry and reconciliation worker
- persistence for sync ledger and audit trail

Recommended supporting components:

- Oracle as the primary app datastore
- Oracle-backed worker tables for v1
- Oracle AQ or TxEventQ only if DBA enablement is approved later
- admin-safe replay and health endpoints

## 5. Recommended Agent Experience

From Zendesk, agents should be able to:

- create a new Azure DevOps issue
- link an existing Azure DevOps issue
- see `ADO Status`
- see a richer explanation such as `In testing in Sprint 112 (Apr 18 - Apr 24)`
- see whether the issue is in a sprint
- see sprint start and sprint end dates
- see current ETA
- open the linked Azure DevOps item if needed

Preferred user experience:

- stored values live in Zendesk fields for reporting and automation
- if native field read-only behavior is not strong enough, a Zendesk sidebar app becomes the authoritative read-only engineering panel

## 6. Routing Insight

Zendesk product mapping should probably not go directly to every available ADO area path.

Better routing model:

- Zendesk detailed `Product` -> Azure DevOps `Custom.Product`
- Zendesk product family or approved routing rule -> Azure DevOps `AreaPath`

Zendesk product-family field (`Product*`) options currently include:

- `BI`
- `Central_Portal`
- `Financials`
- `Merch`
- `Planning`
- `Printing`
- `Reports`
- `Store`
- `SnD`
- `WMS`
- `Ecomm`
- `Omni`
- `Planning.net`

Azure DevOps `Custom.Product` values are more detailed and include:

- `Core-Customer Service Portal`
- `Core-Merchandising`
- `Core-OMNI`
- `Core-POS`
- `Core-WMS`
- `Financials`
- `Mobile-Fulfillment`
- `Mobile-Transfers`
- `Mobile-WMS`
- `SnD-Attribute Center`
- `SnD-Closeout Tool`
- `SnD-Schema Express`
- `Trade Management Portal`
- `Unified Tax Module`

Implication:

- `AreaPath` should be the routing destination.
- `Custom.Product` should carry the product classification.
- The integration should use a curated routing table, not a raw mirror of the full area tree.

Draft v1 candidate routing set:

- `Central_Portal` -> `\\VisionSuite\\Area\\Vision Central Portal`
- `Financials` -> `\\VisionSuite\\Area\\Vision Financials`
- `SnD` -> `\\VisionSuite\\Area\\Vision SnD`
- `Printing` -> `\\VisionSuite\\Area\\Vision Factory Label Printing`
- `BI` or `Reports` -> `\\Vision Analytics\\Area\\Vision Analytics` or `\\VisionSuite\\Area\\Vision Analytics BI Team`
- `Merch` or `WMS` -> `\\VisionSuite\\Area\\Vision Merchandising and WMS`
- `Omni` or selected `Store` issues -> `\\VisionSuite\\Area\\Omni POS Mobile Funnel`

Still unresolved and needs business review:

- `Ecomm`
- `Planning`
- `Planning.net`
- when to use product-domain areas versus funnel areas
- whether `Vision Unified Omni` or `Omni POS Mobile Funnel` is the better default Omni destination

## 7. Working Status Vocabulary

Current preferred `ADO Status` draft values:

- `In Dev Backlog`
- `Scheduled In Sprint`
- `Dev In Progress`
- `Support Ready`

These are still working labels and can be refined with the business.

## 8. Consequences Of These Decisions

### Positive

- Uses infrastructure the client already has
- Keeps the integration isolated from unrelated app concerns
- Preserves Zendesk support workflow
- Gives agents better engineering visibility without forcing them into Azure DevOps
- Supports reliable sync with retries and reconciliation
- Matches the current ADO examples, which already look like support-driven bugs more than generic engineering tasks

### Tradeoffs

- Requires one additional deployed service and env set
- Requires clear reverse-proxy routing and secret management
- Requires a small persistence layer for retry and audit
- May still benefit from a Zendesk sidebar app if field-level UX is not strong enough

## 9. Open Questions For The Next Design Round

- Can the client provide an approved Oracle schema and service account for v1, or do we need an explicit pilot fallback?
- Should the DBA team provision Oracle AQ later, or should we explicitly lock Oracle-backed worker tables as the v1 path now?
- What should the public route or subdomain be for webhook intake?
- Which Azure DevOps project should be the primary destination for go-live?
- Which routing table should be approved for `AreaPath` in v1?
- What is the final routing rule for:
  - Zendesk `Case Type`
  - Zendesk `Product`
  - Zendesk `Org Name`
  - Zendesk `Dept`
- Should `Developer` map to Azure DevOps assignee in v1, or stay informational first?
- Should attachment sync be included in v1 or phase 2?
- Should support custom status change automatically when `ADO Status` becomes `Support Ready`?
- Should the elevated Azure DevOps integration identity use an organization-scoped PAT for v1, with Microsoft Entra as the target-state auth model?
- Can we create Azure DevOps service hooks in the target project without additional admin help?
- Does v1 support one primary ADO link per Zendesk ticket, or multiple linked work items?

## 10. Suggested Next Steps

1. Confirm Oracle schema access, credentials, and deployment connectivity for the integration service.
2. Ask Azure DevOps IT to provision the dedicated integration identity with:
   - `Basic + Test Plans` or `Visual Studio Enterprise`
   - `Project Collection Administrators`
3. Confirm the Azure DevOps auth path for v1 and create or receive credentials for that dedicated identity.
4. Define the exact Zendesk field types and form placement for the `ADO` fields.
5. Encode the default `Bug` creation flow and relink audit-note behavior in the implementation design.
6. Approve a small v1 routing table from Zendesk product families to ADO area paths.
7. Define the Azure DevOps to Zendesk status mapping table.
8. Define the sprint and ETA fallback hierarchy.
9. Implement the sidebar app as a phase-1 deliverable, then validate it on the pilot form before expanding rollout.
10. Verify Azure DevOps service-hook creation rights and attachment upload permission.
11. Lock Oracle-backed worker tables as the v1 worker pattern unless the DBA team later enables AQ, then draft the deployment shape for the new container on the existing Linux Docker host.

## 11. Related Documents

- [ZENDESK-AZURE-DEVOPS-INTEGRATION-TECHNICAL-SPEC.md](./ZENDESK-AZURE-DEVOPS-INTEGRATION-TECHNICAL-SPEC.md)
- [ZENDESK-ADO-V1-ROUTING-MATRIX.md](./ZENDESK-ADO-V1-ROUTING-MATRIX.md)
- [ZENDESK-ADO-V1-FIELD-DEFINITIONS.md](./ZENDESK-ADO-V1-FIELD-DEFINITIONS.md)
- [2026-04-15-zendesk-ado-sota-research-gap-analysis.md](../reports/2026-04-15-zendesk-ado-sota-research-gap-analysis.md)
- [DEVAZURE-ZENDESK-INTEGRATION-PROJECT-CHARTER.md](./DEVAZURE-ZENDESK-INTEGRATION-PROJECT-CHARTER.md)
