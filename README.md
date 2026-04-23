# DevAzure Zendesk Sync

Standalone service for bidirectional sync between Zendesk and Azure DevOps, with Oracle-backed durable state and a Docker-deployed runtime on the client's Linux host.

## Project Context

For implementation work, start with:

- [docs/README.md](./docs/README.md) for the document index and canonical read order
- [conductor/product.md](./conductor/product.md) for product scope and feature maturity
- [conductor/tech-stack.md](./conductor/tech-stack.md) for the actual codebase shape
- [conductor/workflow.md](./conductor/workflow.md) for document precedence and working rules
- [conductor/tracks.md](./conductor/tracks.md) for the current workstream list
- [docs/ops/deployment.md](./docs/ops/deployment.md) for the deployment runbook

## What this service does

Source of truth for customer incidents: Zendesk. Engineering execution target: Azure DevOps. Sync is event-driven and bidirectional:

- **Zendesk → ADO.** Ticket events (`zen:event-type:ticket.*`) hit `POST /webhooks/zendesk` (HMAC-verified), are persisted to an Oracle ledger, picked up by a durable worker (`SELECT FOR UPDATE SKIP LOCKED`), planned against a 13-family routing matrix, and create or update a work item via JSON Patch with revision-based optimistic concurrency. The integration writes ADO work-item ID/URL + status back onto the Zendesk ticket in a single API call.
- **ADO → Zendesk.** Work-item `workitem.created` / `workitem.updated` service-hook events hit `POST /webhooks/ado` (Basic-auth-verified), enqueue a reverse-sync job, and write `ADO Status`, `ADO Status Detail`, `ADO Sprint`, `ADO Sprint Start`, `ADO Sprint End`, `ADO ETA`, and `ADO Sync Health` onto the linked ticket. A SHA-256 fingerprint on `SYNC_LINK.LAST_ADO_FINGERPRINT` short-circuits redundant writes. A 15-minute polling reconciler covers missed service-hook events.

Durable state lives in Oracle (`AUTOMATION@srv-db-100/SUPPOPS`): `SYNC_LINK`, `SYNC_EVENT`, `SYNC_JOB`, `SYNC_ATTEMPT`, `AUDIT_LOG`, `ITERATION_CACHE` — all created idempotently at startup.

## What's included

- Raw `node:http` webhook endpoints with timing-safe auth (HMAC-SHA256 for Zendesk, Basic auth for ADO)
- Oracle pool + schema + 6-table durable state + `SELECT FOR UPDATE SKIP LOCKED` worker (`oracledb` thin mode, no Instant Client)
- V1 product-family routing (`src/routing.ts`) with required ADO field defaults (`Custom.Bucket=Support`, `Custom.Unplanned=true`, `Microsoft.VSTS.Common.ValueArea=Business`)
- 10 `ADO *` Zendesk custom fields + a single-call "update fields + add private note" helper
- ADO status derivation, sprint metadata cache (1h TTL), and status-detail templates per [ZENDESK-ADO-V1-FIELD-DEFINITIONS.md §§ 8-9](./docs/proposals/ZENDESK-ADO-V1-FIELD-DEFINITIONS.md)
- Reverse-sync fingerprint guard (no-op when nothing meaningful changed)
- Reconciliation cron on an offset schedule (`:07 :22 :37 :52`) as a polling safety net
- Docker multi-stage build + compose stack (loopback bind + `extra_hosts` for Oracle) + bring-up runbook
- Admin scripts for tenant setup: create fields, clone/detach forms, register webhooks + service hooks (all share `scripts/lib/zendesk.mjs`)
- Node built-in test coverage for signature, sync planning, ADO status derivation, and event parsing

## Official references used

- Zendesk webhook authenticity: [developer.zendesk.com/documentation/event-connectors/webhooks/verifying](https://developer.zendesk.com/documentation/event-connectors/webhooks/verifying)
- Zendesk webhook request anatomy: [developer.zendesk.com/documentation/webhooks/anatomy-of-a-webhook-request](https://developer.zendesk.com/documentation/webhooks/anatomy-of-a-webhook-request/)
- Zendesk ticket events: [developer.zendesk.com/api-reference/webhooks/event-types/ticket-events](https://developer.zendesk.com/api-reference/webhooks/event-types/ticket-events/)
- Zendesk webhooks API: [developer.zendesk.com/api-reference/webhooks/webhooks-api/webhooks](https://developer.zendesk.com/api-reference/webhooks/webhooks-api/webhooks/)
- Azure DevOps work item create: [learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/create](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/create?view=azure-devops-rest-7.1)
- Azure DevOps work item update: [learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/update](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/update?view=azure-devops-rest-7.1)
- Azure DevOps service hooks: [learn.microsoft.com/en-us/azure/devops/service-hooks/overview](https://learn.microsoft.com/en-us/azure/devops/service-hooks/overview?view=azure-devops)

## Quick start (local development)

```bash
cp .env.example .env
# edit .env with real credentials (Zendesk, ADO, Oracle)
npm install
npm run typecheck
npm run test
```

To start the server:

```bash
npm run build
npm start
```

`npm start` automatically loads values from `.env` when that file exists.

Endpoints:

```text
GET  http://localhost:8787/health          # basic liveness
GET  http://localhost:8787/healthz         # Docker HEALTHCHECK
GET  http://localhost:8787/readyz          # oracle: true/false
POST http://localhost:8787/webhooks/zendesk   # HMAC-verified
POST http://localhost:8787/webhooks/ado       # Basic-auth-verified
```

## Deployment

See [docs/ops/deployment.md](./docs/ops/deployment.md) for the bring-up runbook on `ubuntu-docker-host`. The current state:

- Container is deployed, running, and healthy (`SYNC_DRY_RUN=false`)
- DNS + 443 port-forward for `zendesk-sync.jestais.com` pending IT (tracked as `OPS-002` in `conductor/tracks.md`)
- Caddy site block staged on the host for one-command apply once DNS resolves

## Environment

Required:

- `ZENDESK_WEBHOOK_SECRET`, `ZENDESK_API_USERNAME`, `ZENDESK_API_TOKEN`, `ZENDESK_BASE_URL`
- `DEVAZURE_ORG_URL`, `DEVAZURE_PROJECT`, `DEVAZURE_PAT`
- `ORACLE_DB_HOST`, `ORACLE_DB_SERVICE`, `ORACLE_DB_USERNAME`, `ORACLE_DB_PASSWORD`

Reverse-sync (ADO → us webhook receiver):

- `DEVAZURE_WEBHOOK_USERNAME`, `DEVAZURE_WEBHOOK_PASSWORD` (Basic auth; same values go on the ADO service-hook subscription)

Safety toggles:

- `SYNC_DRY_RUN=true` — disables worker + reconciler crons, returns plans inline without side effects (default)
- `ZENDESK_SKIP_SIGNATURE_VERIFICATION=true` — for local testing only

Optional:

- `INBOUND_BEARER_TOKEN`, `DEVAZURE_AREA_PATH`, `DEVAZURE_ITERATION_PATH`, `DEVAZURE_ASSIGNED_TO`, `DEVAZURE_WEBHOOK_PATH`, `ZENDESK_WEBHOOK_URL`, `ZENDESK_WEBHOOK_NAME`, `ZENDESK_WEBHOOK_EVENTS`

## Admin scripts

Run from the repo root (or inside the container via `docker compose exec`):

```sh
node --env-file-if-exists=.env scripts/create-zendesk-fields.mjs [--attach-form <id>]
node --env-file-if-exists=.env scripts/clone-zendesk-form.mjs --source <id> --name "<new>" --agents-only --attach-ado
node --env-file-if-exists=.env scripts/detach-zendesk-fields.mjs --form <id>
node --env-file-if-exists=.env scripts/find-zendesk-form-attachments.mjs
node --env-file-if-exists=.env scripts/register-zendesk-webhook.mjs       # after public URL is up
node --env-file-if-exists=.env scripts/register-ado-service-hook.mjs      # after public URL is up
```

## Standalone delivery

- No runtime dependency on any internal MusaOS / MyReports code.
- Runtime deps: `oracledb`, `node-zendesk`, `node-cron` (+ `azure-devops-node-api` as dev-only for types).
- Delivery bundle: `npm run package:standalone` → `release/devazure-zendesk-sync/`.

See [CLIENT-HANDOFF.md](./CLIENT-HANDOFF.md) for the delivery checklist.

## Project docs

- [docs/README.md](./docs/README.md)
- [docs/ops/deployment.md](./docs/ops/deployment.md)
- [docs/proposals/ZENDESK-AZURE-DEVOPS-INTEGRATION-TECHNICAL-SPEC.md](./docs/proposals/ZENDESK-AZURE-DEVOPS-INTEGRATION-TECHNICAL-SPEC.md)
- [docs/proposals/ZENDESK-ADO-FULL-SOLUTION-DESIGN.md](./docs/proposals/ZENDESK-ADO-FULL-SOLUTION-DESIGN.md)
- [docs/proposals/ZENDESK-ADO-V1-FIELD-DEFINITIONS.md](./docs/proposals/ZENDESK-ADO-V1-FIELD-DEFINITIONS.md)
- [docs/proposals/ZENDESK-ADO-V1-ROUTING-MATRIX.md](./docs/proposals/ZENDESK-ADO-V1-ROUTING-MATRIX.md)
- [docs/reports/2026-04-15-zendesk-ado-sota-research-gap-analysis.md](./docs/reports/2026-04-15-zendesk-ado-sota-research-gap-analysis.md)

## What's next

See [conductor/tracks.md](./conductor/tracks.md) for the live workstream list. At time of writing:

- **OPS-002** — public URL go-live, blocked on IT (DNS + 443)
- **APP-005** — one Zendesk visual smoke on the refreshed sidebar app
- **APP-004** — Phase 6: comment/attachment sync and relink audit trail
- **HARDEN-001** — operator endpoints, log rotation, kill-switch flag
- **ROUTE-001** — business sign-off on 5 pending product families
