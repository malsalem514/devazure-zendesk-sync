# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Session Startup

Before any implementation work, read in order:

1. `conductor/product.md` — product goal, feature maturity, success metrics
2. `conductor/tech-stack.md` — current vs target components, external constraints
3. `conductor/workflow.md` — document precedence, implementation guardrails, quality gates
4. `conductor/tracks.md` — active workstreams and current implementation gap
5. `docs/README.md` — canonical design doc index and read order

When design docs conflict with the starter README or historical charter, the canonical design docs win (see precedence order in `conductor/workflow.md`).

## Commands

```bash
npm run build          # Compile TypeScript (src/ -> dist/)
npm run typecheck      # Type-check without emitting
npm run dev            # Watch mode (tsc --watch)
npm run test           # Build + run all tests
npm start              # Run compiled server (dist/index.js)
npm run package:standalone  # Build + create release bundle in release/devazure-zendesk-sync/
```

Tests use Node's built-in test runner (`node --test`). Test files are `.mjs` in `test/` and import from `dist/`, so a build is required before tests run. Run a single test file with `node --test test/<file>.test.mjs` (after building).

## What exists today (starter code)

One-way webhook sync: Zendesk ticket events -> Azure DevOps work items. Zero runtime dependencies — only Node built-ins.

**Request flow:** `index.ts` boots server -> `server.ts` handles HTTP (raw `node:http`):
- `GET /health` — health check
- `POST /webhooks/zendesk` — webhook endpoint

Webhook pipeline in `server.ts`:
1. Timing-safe bearer token check (optional, `INBOUND_BEARER_TOKEN`)
2. 1 MB body size limit with stream destroy on overflow
3. Zendesk HMAC-SHA256 signature verification (`zendesk-signature.ts`)
4. Parse event payload (`zendesk-event-parser.ts`)
5. WIQL lookup for existing work item by `zendesk:id:<ticket-id>` tag (`devazure-client.ts`)
6. Build sync plan — create, update, or noop (`sync-planner.ts`)
7. Execute against Azure DevOps REST API with revision-based optimistic concurrency, or return dry-run response

**Key starter design decisions:**
- Deduplication via ADO tag `zendesk:id:<ticket-id>` queried through WIQL (no local DB yet)
- Destructive Zendesk events (soft_deleted, permanently_deleted, marked_as_spam, merged) skipped as noop
- `SYNC_DRY_RUN=true` by default — returns planned operations without calling ADO APIs
- Updates prepend a `test` op on `/rev` for optimistic concurrency
- `ticketId` validated against `/^\d+$/` before WIQL interpolation (injection prevention)
- Health check requests are not logged to avoid noise from load balancer probes
- Non-HttpError exceptions are logged server-side; clients receive generic `"Internal server error"`

## What the target v1 adds (not yet built)

The target is a full bidirectional integration with Oracle persistence. See `conductor/product.md` for the complete gap list. Major additions:

- **Oracle persistence** — `node-oracledb`, sync ledger, worker tables, audit log (`SUPPOPS` DB, `AUTOMATION` schema, Oracle 19c)
- **Zendesk custom fields** — 10 `ADO *` fields (Status, Sprint, ETA, etc.) created in the Zendesk tenant, updated by the integration
- **Zendesk API client** — outbound calls to update ticket fields and add private notes
- **Routing engine** — product-family matrix mapping Zendesk `Product*` -> ADO project + area path + `Custom.Product`
- **Required ADO fields** — `Custom.Bucket=Support`, `Custom.Unplanned=true`, `Microsoft.VSTS.Common.ValueArea=Business`
- **Reverse sync** — ADO service hooks -> update Zendesk fields with engineering status, sprint dates, ETA
- **Reconciliation worker** — scheduled refresh of open links, retry failed jobs, refresh sprint metadata
- **Docker deployment** — container on client Linux host (`/srv/stacks/zendesk-ado-sync/`), loopback bind + Caddy reverse proxy

## Implementation Guardrails

- Keep the integration standalone — no coupling to MusaOS or MyReports runtime code
- Oracle-backed worker tables are the v1 execution model (not AQ — `DBMS_AQADM` is unavailable in the `AUTOMATION` schema)
- Secrets in `.env` only — never in docs, tests, or committed files
- Use the routing matrix (`docs/proposals/ZENDESK-ADO-V1-ROUTING-MATRIX.md`) and field definitions (`docs/proposals/ZENDESK-ADO-V1-FIELD-DEFINITIONS.md`) for v1 mapping behavior
- Prefer durable async processing over inline webhook-side work when the target design calls for persistence or retries
- Do not auto-escalate every Zendesk ticket — require explicit escalation criteria
- Zendesk native status stays separate from ADO engineering status (synced via `ADO Status` field)

## Configuration

All config from environment variables, loaded in `config.ts`. Copy `.env.example` to `.env`. Required: `ZENDESK_WEBHOOK_SECRET`, `DEVAZURE_ORG_URL`, `DEVAZURE_PROJECT`, `DEVAZURE_PAT`. Signature verification can be bypassed with `ZENDESK_SKIP_SIGNATURE_VERIFICATION=true` for local testing only.

Target v1 will add: `ZENDESK_API_TOKEN`, `ZENDESK_API_EMAIL`, `ORACLE_*` connection vars.

## TypeScript

- Target: ES2022, ESM modules (`"type": "module"` in package.json)
- Strict mode enabled
- All internal imports use `.js` extensions (TypeScript ESM convention)
- Node >= 24.14.0 required

## Client and tenant details

- **Client:** Jestais
- **Zendesk:** `jestaissupport.zendesk.com`
- **Azure DevOps:** `dev.azure.com/jestaisinc` (projects: `VisionSuite`, `Vision Analytics`)
- **Oracle:** `SUPPOPS` DB on `srv-db-100`, schema `AUTOMATION`
- **Deploy target:** `ubuntu-docker-host` (172.16.20.97), Ubuntu 24.04, Docker + Caddy + Watchtower, stacks at `/srv/stacks/`
