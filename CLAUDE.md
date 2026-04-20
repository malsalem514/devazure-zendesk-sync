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
7. `docs/proposals/ZENDESK-SIDEBAR-APP-IMPLEMENTATION-SPEC.md` — approved v1 UX direction (sidebar app, not always-visible fields)

When design docs conflict with the starter README or historical charter, the canonical design docs win (see precedence order in `conductor/workflow.md`).

## Commands

```bash
npm run build               # Compile TypeScript (src/ -> dist/)
npm run typecheck           # Type-check without emitting
npm run dev                 # Watch mode (tsc --watch)
npm run test                # Build + run all tests (Node's built-in test runner)
npm start                   # Run compiled server (dist/index.js)
npm run package:standalone  # Build + create release bundle in release/devazure-zendesk-sync/
npm run app:install         # Install dependencies for zendesk-sidebar-app/
npm run app:dev             # Run the sidebar app Vite dev server
npm run app:build           # Build the sidebar app package
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

Phases 1–5 are code-complete in-repo. The stack is deployed to `ubuntu-docker-host` (172.16.20.97) and running live with `SYNC_DRY_RUN=false`. Caddy + public DNS are pending IT (`OPS-002`). Reverse sync was validated via a signed loopback webhook; the first live round-trip was Zendesk #39045 → ADO Bug #79741 on 2026-04-17.

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
4. Compute dedup key (Zendesk prefers `x-zendesk-webhook-invocation-id`, falls back to rendered payload `id` + `event.type` + `ticket.id`)
5. Atomically `INSERT` into `SYNC_EVENT` + `SYNC_JOB` in one transaction (`persistEventAndEnqueueJob` in `worker.ts`), catching `ORA-00001` for dedup
6. Return `202 Accepted` immediately

### Durable worker (`src/worker.ts`)

- Polls `SYNC_JOB` every 10 seconds, batches up to 50 per tick
- Claim pattern: `SELECT ... WHERE STATUS='PENDING' AND NEXT_PROCESS_AT<=SYSTIMESTAMP FOR UPDATE SKIP LOCKED`
- Exponential backoff on retry (`POWER(2, attempt_count) + jitter`, capped at 3600s). Max attempts → `DEAD`.
- Records every attempt in `SYNC_ATTEMPT`; records every success/mutation in `AUDIT_LOG`.
- Stale-recovery cron: every 5 min, resets `PROCESSING` jobs stuck > 5 min back to `PENDING`.
- Job types: `create_ado_from_zendesk`, `update_ado_from_zendesk`, `sync_ado_state_to_zendesk`.

### Zendesk → ADO (create / update)

Handler `handleSyncZendeskToAdo` in `src/job-handlers.ts`:
1. Parse ticket event from stored payload
2. WIQL lookup for existing work item by tag `zendesk:id:<ticket-id>` (`devazure-client.ts`)
3. Build plan in `sync-planner.ts` — applies V1 routing matrix (13 product families, `src/routing.ts`), sets required ADO fields (`Custom.Bucket=Support`, `Custom.Unplanned=true`, `Microsoft.VSTS.Common.ValueArea=Business`), maps case-type → work-item-type
4. Create or update via the ADO REST API (revision-based optimistic concurrency: updates prepend a `test` op on `/rev`)
5. Insert into `SYNC_LINK` (unique on `ZENDESK_TICKET_ID` when `IS_ACTIVE=1`)
6. Single Zendesk API call writes ADO fields (`ADO Work Item ID`, URL, `ADO Status`, etc.) plus the legacy `Dev Funnel #` link, plus a private note

### ADO → Zendesk (reverse sync)

Handler `handleSyncAdoStateToZendesk` in `src/job-handlers.ts`:
1. Lookup `SYNC_LINK` by `ADO_WORK_ITEM_ID`
2. Fetch ADO work item (only the five fields we read) via `DevAzureClient.getWorkItem`
3. Resolve iteration metadata through `ITERATION_CACHE` (1h TTL) via `fetchIterationMetadata`
4. Derive status + status-detail via `ado-status.ts` (rules at `docs/proposals/ZENDESK-ADO-V1-FIELD-DEFINITIONS.md` §§ 8–9)
5. Compute SHA-256 fingerprint; skip Zendesk write if unchanged
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

## Sidebar app (`zendesk-sidebar-app/`)

The approved v1 agent UX is a private Zendesk ticket sidebar app, not an always-visible ADO field block on every support form. Rationale: one rollout, best agent experience, no double training. See `docs/proposals/ZENDESK-SIDEBAR-APP-IMPLEMENTATION-SPEC.md` for the authoritative spec.

Separate npm workspace built from Zendesk's official React + Vite scaffold (Garden UI). Driven by `npm run app:*` from the repo root.

Current scaffold state (Milestone 1 of 5):
- Loads in `ticket_sidebar`, reads ticket context via ZAF
- Reads existing linked-ADO custom fields directly (`ADO Work Item ID`, URL, `ADO Status`, Sprint, ETA, Sync Health, Last Sync At, plus legacy `Dev Funnel #`)
- Hides itself when `ticket.form.id !== 50882600373907` (pilot form `Musa ADO Form Testing`)
- Shows linked / empty / loading / error states
- `Create new ADO` and `Link existing ADO` surfaces are scaffold-only until backend endpoints land

Pending (`APP-005`):
- Backend endpoints: `GET /app/ado/tickets/:ticketId/summary`, `POST .../create`, `POST .../link`
- Auth: client calls via `client.request()` with ZAF JWT in `Authorization`, backend verifies with a shared secret from Zendesk secure app settings
- Install as a private app in the live Zendesk tenant

Because the sidebar renders live ADO state (status, sprint, ETA, sync health), **Phase 4 reverse sync is a dependency of the sidebar UX**, not a replacement for it.

## What's pending

- **OPS-002 (Phase 5 go-live):** DNS record `zendesk-sync.jestais.com` + TCP 443 port-forward from jestais firewall/NAT to `172.16.20.97`. Caddy site block staged on the host at `/tmp/caddy-zendesk-sync.snippet`. Once DNS resolves, `scripts/register-zendesk-webhook.mjs` + `scripts/register-ado-service-hook.mjs` complete the flow. The current pilot uses a temporary Cloudflare quick tunnel; its URL can rotate if the container restarts.
- **APP-005 (sidebar app):** backend summary / create / link endpoints, ZAF JWT auth, tenant install, pilot-form gating validation.
- **APP-004 (Phase 6, planned):** comment/attachment sync with integration marker and loop prevention, link-existing workflow, relink audit trail.
- **HARDEN-001 (planned):** operator endpoints (`POST /internal/reconcile`, `GET /internal/failed-jobs`), log rotation, structured logs, kill-switch flag.
- **ROUTE-001 (pending business approval):** 5 product families (`BI`, `Reports`, `Ecomm`, `Planning`, `Planning.net`) — `src/routing.ts` returns a low-confidence fallback for these.

## Implementation Guardrails

- Keep the integration standalone — no coupling to MusaOS or MyReports runtime code
- Oracle-backed worker tables are the v1 execution model (not AQ — `DBMS_AQADM` is unavailable in the `AUTOMATION` schema)
- Secrets in `.env` only — never in docs, tests, or committed files
- Use the routing matrix (`docs/proposals/ZENDESK-ADO-V1-ROUTING-MATRIX.md`) and field definitions (`docs/proposals/ZENDESK-ADO-V1-FIELD-DEFINITIONS.md`) for v1 mapping behavior
- Prefer durable async processing over inline webhook-side work when the target design calls for persistence or retries
- Do not auto-escalate every Zendesk ticket — require explicit escalation criteria
- Zendesk native status stays separate from ADO engineering status (synced via `ADO Status` field)
- The sidebar app is the primary agent surface; keep the machine-owned `ADO *` fields off normal support forms unless needed for testing, reporting, or trigger plumbing
- `Dev Funnel #` should stay populated with the ADO deep link whenever a ticket is linked — it is the familiar reference for legacy support workflows

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
- **First live round-trip:** Zendesk #39045 → ADO Bug #79741 (2026-04-17)
