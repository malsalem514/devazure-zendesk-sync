# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Session Startup

Before any implementation work, read in order:

1. `conductor/product.md` — product goal, feature maturity, success metrics
2. `conductor/tech-stack.md` — current components and external constraints
3. `conductor/workflow.md` — document precedence, implementation guardrails, quality gates
4. `conductor/tracks.md` — active workstreams and current implementation gap
5. `docs/README.md` — canonical design doc index and read order
6. `docs/ops/deployment.md` — live deployment state, host layout, operational commands

When design docs conflict with the starter README or historical charter, the canonical design docs win (see precedence order in `conductor/workflow.md`).

## Commands

```bash
npm run build          # Compile TypeScript (src/ -> dist/)
npm run typecheck      # Type-check without emitting
npm run dev            # Watch mode (tsc --watch)
npm run test           # Build + run all tests (Node's built-in test runner)
npm start              # Run compiled server (dist/index.js)
npm run package:standalone  # Build + create release bundle in release/devazure-zendesk-sync/
```

Tests use Node's built-in test runner (`node --test`). Test files are `.mjs` in `test/` and import from `dist/`, so a build is required before tests run. Run a single test file with `node --test test/<file>.test.mjs` (after building).

Admin scripts (run with `node --env-file-if-exists=.env scripts/<name>.mjs`):
- `create-zendesk-fields.mjs` — create the 10 ADO fields in the Zendesk tenant (idempotent)
- `clone-zendesk-form.mjs` — clone a form, optionally attach ADO fields, optionally agents-only
- `detach-zendesk-fields.mjs` / `find-zendesk-form-attachments.mjs` — audit + remove ADO fields from forms
- `register-zendesk-webhook.mjs` — register the Zendesk → us webhook and fetch its signing secret
- `register-ado-service-hook.mjs` — register the ADO → us service hook subscriptions

Shared helpers for the `.mjs` scripts live in `scripts/lib/zendesk.mjs` (single source of truth for the `V1_FIELDS` table).

## What's implemented

Phases 1-5 are code-complete in-repo. The stack is deployed to `ubuntu-docker-host` (172.16.20.97) and running live with `SYNC_DRY_RUN=false`; Caddy + public DNS are pending IT.

### Request flow

`src/index.ts` boots the server, creates the Oracle pool, initializes schema, and starts three `node-cron` loops (worker polling, stale-job recovery, reconciler).

`src/server.ts` handles HTTP (raw `node:http`):
- `GET /health` — basic liveness + dry-run flag
- `GET /healthz` — Docker `HEALTHCHECK` endpoint (also basic)
- `GET /readyz` — readiness, includes `oracle: true/false` from `SELECT 1 FROM DUAL`
- `POST /webhooks/zendesk` — Zendesk ticket events (HMAC-signature verified)
- `POST /webhooks/ado` — ADO service-hook events (Basic-auth verified)

### Inbound webhook pipeline

For both `/webhooks/zendesk` and `/webhooks/ado`:
1. Auth check (HMAC signature / Basic auth shared secret)
2. 1 MB body size limit with stream destroy on overflow
3. Parse event (`zendesk-event-parser.ts` / `ado-event-parser.ts`)
4. Compute dedup key
5. Atomically `INSERT` into `SYNC_EVENT` + `SYNC_JOB` in one transaction (`persistEventAndEnqueueJob` in `worker.ts`), catching `ORA-00001` for dedup
6. Return `202 Accepted` immediately

### Durable worker (`src/worker.ts`)

- Polls `SYNC_JOB` every 10 seconds, batches up to 50 per tick
- Claim pattern: `SELECT ... WHERE STATUS='PENDING' AND NEXT_PROCESS_AT<=SYSTIMESTAMP FOR UPDATE SKIP LOCKED`
- Exponential backoff on retry (`POWER(2, attempt_count) + jitter`, capped at 3600s). Max attempts → `DEAD`.
- Records every attempt in `SYNC_ATTEMPT`; records every success/mutation in `AUDIT_LOG`.
- Stale-recovery cron: every 5 min, resets `PROCESSING` jobs stuck > 5 min back to `PENDING`.
- Job types (`JOB_TYPES` constant): `create_ado_from_zendesk`, `update_ado_from_zendesk`, `sync_ado_state_to_zendesk`.

### Zendesk → ADO (create / update)

Handler `handleSyncZendeskToAdo` in `src/job-handlers.ts`:
1. Parse ticket event from stored payload
2. WIQL lookup for existing work item by tag `zendesk:id:<ticket-id>` (`devazure-client.ts`)
3. Build plan in `sync-planner.ts` — applies V1 routing matrix (13 product families, `src/routing.ts`), sets required ADO fields (`Custom.Bucket=Support`, `Custom.Unplanned=true`, `Microsoft.VSTS.Common.ValueArea=Business`), maps case-type → work-item-type
4. Create or update via the ADO REST API (revision-based optimistic concurrency: updates prepend a `test` op on `/rev`)
5. Insert into `SYNC_LINK` (unique on `ZENDESK_TICKET_ID` when `IS_ACTIVE=1`)
6. Single Zendesk API call writes ADO fields + private note

### ADO → Zendesk (reverse sync)

Handler `handleSyncAdoStateToZendesk` in `src/job-handlers.ts`:
1. Lookup `SYNC_LINK` by `ADO_WORK_ITEM_ID`
2. Fetch ADO work item (only the five fields we read) via `DevAzureClient.getWorkItem`
3. Resolve iteration metadata through `ITERATION_CACHE` (1h TTL) via `fetchIterationMetadata`
4. Derive status + status-detail via `ado-status.ts` (rules at [ZENDESK-ADO-V1-FIELD-DEFINITIONS.md §§ 8-9](docs/proposals/ZENDESK-ADO-V1-FIELD-DEFINITIONS.md))
5. Compute SHA-256 fingerprint; skip Zendesk write if unchanged (design pillar 2)
6. Update Zendesk fields + private note; update `SYNC_LINK.LAST_ADO_FINGERPRINT`; audit

### Reconciler (`src/reconciler.ts`)

Safety net for missed ADO webhooks. Cron at `:07 :22 :37 :52` (mid-bucket offset prevents clock-jitter duplicates). For each active `SYNC_LINK` whose `LAST_SYNCED_AT` is older than 15 min, enqueues a `sync_ado_state_to_zendesk` job using a bucket-stamped dedup key so concurrent passes collapse via the `SYNC_EVENT` unique constraint.

### Oracle schema (`src/schema.ts`, `initializeSchema()`)

Six tables, created idempotently at startup via `safeExecuteDDL`:
`SYNC_LINK`, `SYNC_EVENT`, `SYNC_JOB`, `SYNC_ATTEMPT`, `AUDIT_LOG`, `ITERATION_CACHE`. `SUPPOPS` DB on `srv-db-100`, schema `AUTOMATION`, Oracle 19c, thin-mode driver (no Instant Client).

### Key design decisions in code

- `oracledb.fetchAsString = [oracledb.CLOB]` globally so `SYNC_JOB.PAYLOAD` deserializes as a string, not a `Lob` object (would otherwise produce `"[object Object]" is not valid JSON`).
- Destructive Zendesk events (`soft_deleted`, `permanently_deleted`, `marked_as_spam`, `merged`) are persisted but planner returns `noop`.
- `ticketId` validated against `/^\d+$/` before WIQL interpolation (injection prevention).
- Non-`HttpError` exceptions logged server-side; clients see generic `Internal server error`.
- `DevAzureHttpError` carries the status code so 404 handling is typed, not regex-matched on error messages.
- Webhook endpoints use loopback bind (`127.0.0.1:8787`) behind host-level Caddy.

## What's pending

- **Phase 5 live go-live:** DNS + 443 port-forward from IT (tracked in `docs/ops/deployment.md`). Caddy site block staged on the host at `/tmp/caddy-zendesk-sync.snippet`. Once DNS resolves, `scripts/register-zendesk-webhook.mjs` + `scripts/register-ado-service-hook.mjs` complete the flow.
- **Phase 6 (APP-004, planned):** comment/attachment sync with integration marker and loop prevention, link-existing workflow (agent pastes ADO URL), relink audit trail.
- **HARDEN-001 (planned):** operator endpoints (`POST /internal/reconcile`, `GET /internal/failed-jobs`), log rotation, structured logs, kill-switch flag.
- **Pending routing approvals:** 5 product families (`BI`, `Reports`, `Ecomm`, `Planning`, `Planning.net`) — `src/routing.ts` returns a low-confidence fallback for these until business approval.

## Implementation Guardrails

- Keep the integration standalone — no coupling to MusaOS or MyReports runtime code
- Oracle-backed worker tables are the v1 execution model (not AQ — `DBMS_AQADM` is unavailable in the `AUTOMATION` schema)
- Secrets in `.env` only — never in docs, tests, or committed files
- Use the routing matrix (`docs/proposals/ZENDESK-ADO-V1-ROUTING-MATRIX.md`) and field definitions (`docs/proposals/ZENDESK-ADO-V1-FIELD-DEFINITIONS.md`) for v1 mapping behavior
- Prefer durable async processing over inline webhook-side work when the target design calls for persistence or retries
- Do not auto-escalate every Zendesk ticket — require explicit escalation criteria
- Zendesk native status stays separate from ADO engineering status (synced via `ADO Status` field)

## Configuration

All config from environment variables, loaded in `src/config.ts`. Copy `.env.example` to `.env`.

Required: `ZENDESK_WEBHOOK_SECRET`, `ZENDESK_API_USERNAME`, `ZENDESK_API_TOKEN`, `ZENDESK_BASE_URL`, `DEVAZURE_ORG_URL`, `DEVAZURE_PROJECT`, `DEVAZURE_PAT`, `ORACLE_DB_HOST`, `ORACLE_DB_SERVICE`, `ORACLE_DB_USERNAME`, `ORACLE_DB_PASSWORD`.

Phase 4 reverse-sync: `DEVAZURE_WEBHOOK_USERNAME`, `DEVAZURE_WEBHOOK_PASSWORD` (Basic-auth shared secret with the ADO service-hook subscription). Optional `DEVAZURE_WEBHOOK_PATH` (default `/webhooks/ado`).

Safety toggles: `SYNC_DRY_RUN=true` disables worker + reconciler crons (returns plans inline, no side effects). `ZENDESK_SKIP_SIGNATURE_VERIFICATION=true` for local testing only.

## TypeScript

- Target: ES2022, ESM modules (`"type": "module"` in package.json)
- Strict mode enabled
- All internal imports use `.js` extensions (TypeScript ESM convention)
- Node >= 24.14.0 required

## Client and tenant details

- **Client:** Jestais
- **Zendesk:** `jestaissupport.zendesk.com`
- **Azure DevOps:** `dev.azure.com/jestaisinc` (projects: `VisionSuite`, `Vision Analytics`)
- **Oracle:** `SUPPOPS` DB on `srv-db-100` (172.16.25.63), schema `AUTOMATION`
- **Deploy target:** `ubuntu-docker-host` (172.16.20.97), Ubuntu 24.04, Docker + Caddy + Watchtower, stacks at `/srv/stacks/`
- **Sandbox Zendesk form for pilot testing:** `Musa ADO Form Testing` (ID `50882600373907`, agents-only, 10 ADO fields attached)
