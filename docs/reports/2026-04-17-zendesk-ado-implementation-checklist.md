# Zendesk ADO Implementation Checklist

**Date:** 2026-04-17  
**Purpose:** Provide one practical execution checklist that separates what is already live from what still needs to be built for reverse synchronization and the approved sidebar app-first Zendesk agent UX.

## 1. Current Snapshot

Current live state:

- Zendesk -> ADO create flow is working end to end on the real tenant and host
- Ticket `#39045` successfully created ADO Bug `#79741`
- Zendesk writeback is working for:
  - `Dev Funnel #`
  - `ADO Work Item ID`
  - `ADO Work Item URL`
  - `ADO Sync Health`
  - `ADO Last Sync At`
  - private audit note
- Routing and dedupe fixes are deployed live
- Temporary public ingress is via Cloudflare quick tunnel
- Reverse ADO -> Zendesk synchronization is not deployed yet
- Sidebar app-first create/link UX is approved in docs but not implemented yet

## 2. What We Already Have

### 2.1 Access and deployment

- [x] Zendesk API access is working with admin credentials
- [x] Azure DevOps PAT access is working
- [x] Oracle access is working against `SUPPOPS` / `AUTOMATION`
- [x] Linux Docker host access is working
- [x] Integration container is deployed and healthy on `127.0.0.1:8787`
- [x] Temporary public webhook reachability is working through Cloudflare quick tunnel

### 2.2 Zendesk -> ADO sync behavior live today

- [x] Accept Zendesk webhook events
- [x] Verify Zendesk webhook signatures
- [x] Persist incoming events and enqueue durable jobs in Oracle
- [x] Deduplicate webhook deliveries using Zendesk invocation ID when available
- [x] Create a new ADO work item from Zendesk ticket data
- [x] Update an existing linked ADO work item when the Zendesk ticket changes
- [x] Add Zendesk hyperlink relation to the ADO item on create
- [x] Store Oracle link and audit records

### 2.3 Zendesk -> ADO field flow live today

- [x] Zendesk subject -> `System.Title`
- [x] Zendesk description and latest comment -> `System.Description`
- [x] Sidebar create handoff sections -> `System.Description` plus supported native ADO form fields (`Microsoft.VSTS.TCM.ReproSteps`, `Microsoft.VSTS.TCM.SystemInfo`, `Microsoft.VSTS.Common.AcceptanceCriteria`, `Custom.FinalResluts`/`Custom.FinalResults`)
- [x] Zendesk tags/status/priority -> `System.Tags`
- [x] Zendesk priority -> `Microsoft.VSTS.Common.Priority`
- [x] Zendesk `Product` -> routed `System.AreaPath` and `Custom.Product` on create
- [x] Zendesk `Org Name` -> `Custom.Client`
- [x] Zendesk `CRF` -> `Custom.CRF`
- [x] Zendesk `Case Type` -> work item type resolution

### 2.4 Zendesk writeback live today

- [x] Write `Dev Funnel #` with the ADO deep link after a successful link/create
- [x] Write `ADO Work Item ID`
- [x] Write `ADO Work Item URL`
- [x] Write `ADO Sync Health`
- [x] Write `ADO Last Sync At`
- [x] Add a private note confirming the linked ADO item
- [x] Write initial placeholder values for `ADO Status` and `ADO Status Detail`

## 3. What Is Not Synced Yet

These are not live yet and should not be assumed to stay current automatically:

- [ ] ADO status changes made later by engineering
- [ ] ADO sprint assignment changes
- [ ] ADO sprint date changes
- [ ] ADO ETA changes
- [ ] ADO completion / support-ready state transitions
- [ ] ADO comments or engineering notes back into Zendesk
- [ ] ADO attachments
- [ ] Zendesk native support status <-> ADO state synchronization
- [ ] Link-existing workflow from a Zendesk ticket
- [ ] Relink workflow
- [ ] Sidebar app create/link UX from an existing Zendesk ticket

## 4. Reverse Sync Checklist

This is the work needed so Zendesk stays up to date when ADO changes after initial creation/link.

### 4.1 Ingress and event intake

- [x] Add ADO inbound webhook endpoint to the service
- [x] Register Azure DevOps service hooks for work item changed events on the current pilot public endpoint
- [ ] Verify the public ingress path used by ADO is stable, not the temporary quick tunnel, before production rollout
- [x] Add dedupe rules for ADO-originated events
- [x] Store raw ADO events in Oracle audit/event tables
- [x] Keep 15-minute reconciler fallback active until ADO service hooks are registered and stable

### 4.2 Linked item resolution

- [ ] Resolve which Zendesk ticket is linked to the changed ADO work item
- [ ] Support both integration-created links and future link-existing records
- [ ] Decide whether one Zendesk ticket may map to more than one ADO item in v1

### 4.3 ADO-owned field refresh

- [ ] Read current ADO work item state after each relevant change
- [ ] Derive `ADO Status` from ADO state + sprint context
- [ ] Derive `ADO Status Detail` from ADO state + sprint context
- [ ] Resolve sprint name and dates from iteration metadata
- [ ] Populate `ADO Sprint`
- [ ] Populate `ADO Sprint Start`
- [ ] Populate `ADO Sprint End`
- [ ] Populate `ADO ETA` using the approved fallback hierarchy
- [ ] Refresh `ADO Work Item URL` and `Dev Funnel #` if needed
- [ ] Refresh `ADO Last Sync At`
- [ ] Refresh `ADO Sync Health`

### 4.4 Zendesk writeback behavior

- [ ] Update the hidden machine-owned `ADO *` fields in Zendesk
- [ ] Add meaningful private notes only for significant engineering changes
- [ ] Avoid creating noisy notes for every minor ADO edit
- [ ] Keep Zendesk native support status untouched unless a future approved rule explicitly changes that

### 4.5 Resilience and recovery

- [ ] Retry transient ADO/Zendesk failures
- [ ] Mark hard failures clearly in `ADO Sync Health`
- [ ] Add replay path for failed reverse-sync jobs
- [ ] Add reconciliation job to refresh open links periodically
- [ ] Add monitoring/logging for reverse-sync health

## 5. Sidebar App UX Checklist

This is the work needed to implement the approved best-agent-experience workflow in a single rollout.

### 5.1 Zendesk app setup

- [x] Create a private Zendesk ticket sidebar app package in the repo (`zendesk-sidebar-app/`)
- [ ] Install it in the live tenant in ticket sidebar location
- [ ] Make it available on `Musa ADO Form Testing` first
- [ ] Confirm the app can read current ticket context in Agent Workspace
- [x] Make the app self-hide unless `ticket.form.id = 50882600373907` during development and pilot

### 5.2 Sidebar app UI

- [x] Empty state when no ADO item is linked
- [x] Scaffold `Create new ADO` action surface
- [x] Scaffold `Link existing ADO` action surface
- [x] Input that accepts numeric ADO ID or full ADO URL
- [x] Linked-item view with work item ID and `Open in Azure DevOps`
- [x] Compact status display using `ADO Status` and `ADO Status Detail`
- [ ] Compact loading, success, and error states fully validated end to end

### 5.3 Backend endpoints and logic

- [ ] Add app-facing backend endpoint for `Create new ADO`
- [ ] Add app-facing backend endpoint for `Link existing ADO`
- [ ] Validate the referenced ADO work item exists
- [ ] Persist link-existing records in Oracle
- [ ] Write all machine-owned Zendesk fields from the linked ADO item
- [ ] Populate `Dev Funnel #` with the canonical ADO deep link
- [ ] Add internal audit note for create, link, and future relink actions
- [ ] Return support-friendly error messages to the app

### 5.4 Standard form behavior

- [ ] Keep the standard support form unchanged except for existing fields already in use
- [ ] Keep the machine-owned `ADO *` fields off the standard support form
- [ ] Decide whether `Dev Funnel #` remains visibly on the form or becomes mostly backward-compatible
- [ ] Avoid creating a native field-based create/link flow in parallel

### 5.5 Testing and rollout

- [ ] Validate create flow from the sidebar app on `Musa ADO Form Testing`
- [ ] Validate link-existing flow from the sidebar app on `Musa ADO Form Testing`
- [ ] Validate duplicate-create protection
- [ ] Validate success and failure states in the app
- [ ] Validate linked-item status display in the app
- [ ] Validate form-gating behavior: app visible on `Musa ADO Form Testing`, hidden elsewhere
- [ ] Promote to `Support` only after the first app flow is stable

## 6. Recommended Build Order

Recommended next sequence:

1. Install and validate the scaffolded sidebar app UX on `Musa ADO Form Testing`
2. Implement the app-facing summary, create, and link backend endpoints
3. Implement link-existing persistence and validation
4. Implement ADO -> Zendesk reverse sync for status, sprint, ETA, and private-note updates
5. Add reconciliation and replay tooling
6. Replace the temporary tunnel with stable public ingress before production rollout

## 7. First Release Boundary

A sensible first sidebar-app release should include:

- the small sidebar app create/link UX
- create new ADO from an existing Zendesk ticket
- link existing ADO from an existing Zendesk ticket
- `Dev Funnel #` population
- hidden machine-owned `ADO *` fields maintained by the integration
- private-note confirmation

It does not need to include on day one:

- full comment sync
- attachment sync
- multiple ADO links per ticket
- ADO search by title/query
- Zendesk native status automation tied to engineering state

## 8. Source References

- UX and field ownership: [../proposals/ZENDESK-ADO-V1-FIELD-DEFINITIONS.md](../proposals/ZENDESK-ADO-V1-FIELD-DEFINITIONS.md)
- Agent experience and UI direction: [../proposals/ZENDESK-AZURE-DEVOPS-INTEGRATION-TECHNICAL-SPEC.md](../proposals/ZENDESK-AZURE-DEVOPS-INTEGRATION-TECHNICAL-SPEC.md)
- Form placement and rollout scope: [../proposals/ZENDESK-ADO-FULL-SOLUTION-DESIGN.md](../proposals/ZENDESK-ADO-FULL-SOLUTION-DESIGN.md)
- Current live pilot and operational caveats: [../../CLAUDE.md](../../CLAUDE.md)
