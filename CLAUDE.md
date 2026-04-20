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
npm run app:install    # Install dependencies for zendesk-sidebar-app/
npm run app:dev        # Run the sidebar app Vite dev server
npm run app:build      # Build the sidebar app package
```

Tests use Node's built-in test runner (`node --test`). Test files are `.mjs` in `test/` and import from `dist/`, so a build is required before tests run. Run a single test file with `node --test test/<file>.test.mjs` (after building). Current coverage is `sync-planner` and `zendesk-signature` only — Oracle/worker paths are validated live against the pilot tenant.

## Architecture

One-way Zendesk -> ADO sync with Oracle-backed durable worker. Phases 1-3 complete; Phase 4 (reverse sync) is the active gap.

**Boot (`index.ts`):** loads config -> initializes Oracle pool -> runs `schema.ts` DDL (idempotent `CREATE` guarded by `safeExecuteDDL`) -> starts HTTP server -> starts two cron tasks (skipped when `SYNC_DRY_RUN=true`):
- `*/10 * * * * *` — `worker.pollOnce` drains up to 50 jobs per tick
- `*/5 * * * *` — `worker.recoverStaleJobs` re-queues jobs orphaned by worker crash

**Webhook ingress (`server.ts`, raw `node:http`):**
- `GET /health` — liveness + Oracle `oracleHealthCheck`
- `POST /webhooks/zendesk` pipeline: timing-safe bearer check (`INBOUND_BEARER_TOKEN`, optional) -> 1 MB body cap with `request.destroy()` on overflow -> Zendesk HMAC-SHA256 verify (`zendesk-signature.ts`) -> dedupe on `x-zendesk-webhook-invocation-id` then payload `id` -> `persistEventAndEnqueueJob` inserts `SYNC_EVENT` + `SYNC_JOB` rows atomically and returns 202
- The webhook handler does NOT call ADO inline anymore. All external I/O happens in the worker.

**Worker (`worker.ts`):** claims one job at a time using `SELECT … FOR UPDATE SKIP LOCKED`, flips status to `PROCESSING`, commits to release the lock, then dispatches via `job-handlers.dispatchJob`. On failure: increments `ATTEMPT_COUNT`, schedules `NEXT_PROCESS_AT` with exponential backoff, terminal after `MAX_ATTEMPTS`. `WORKER_ID = worker-<pid>-<bootTime>` identifies the claiming process.

**Job handlers (`job-handlers.ts`):** `sync_zendesk_to_ado` re-parses the raw event, resolves routing (`routing.ts` — product-family matrix -> project + area path + `Custom.Product`), finds the existing ADO work item by `zendesk:id:<ticketId>` tag (WIQL), runs `sync-planner.buildSyncPlan` (create | update | noop), calls `DevAzureClient`, writes a `SYNC_LINK` row on create, then calls `zendesk-api.updateTicketWithNote` to write back `ADO Work Item ID`, URL, status, sync health, last sync timestamp, and a private note.

**Oracle schema (`schema.ts`):** `SYNC_LINK` (ticket<->work item pairs), `SYNC_EVENT` (inbound event log), `SYNC_JOB` (queue, `STATUS IN ('PENDING','PROCESSING','DONE','FAILED')`), `SYNC_ATTEMPT` (per-try audit), `AUDIT_LOG`. Each has its own sequence. DDL is idempotent via `safeExecuteDDL` (swallows ORA-00955 "already exists").

**Zendesk integration (`lib/zendesk-api.ts` + `zendesk-field-ids.ts`):** Field ID map is client-specific and checked in. `setFieldIdMap` injects it once at boot. Outbound calls use `node-zendesk` against `jestaissupport.zendesk.com` with API-token auth.

**Key design invariants:**
- Deduplication uses ADO tag `zendesk:id:<ticket-id>` (WIQL-queried) — there is no unique index on `SYNC_LINK.ZENDESK_TICKET_ID` because "linked" mode allows re-linking.
- `ticketId` validated against `/^\d+$/` before WIQL interpolation (injection prevention).
- Destructive Zendesk events (`soft_deleted`, `permanently_deleted`, `marked_as_spam`, `merged`) become noop jobs — do not propagate to ADO.
- `SYNC_DRY_RUN=true` disables the worker cron entirely, so dry-run is plan-only, not "executed without side effects".
- ADO update operations prepend a `test` op on `/rev` for revision-based optimistic concurrency.
- Health check requests are not logged. Non-`HttpError` exceptions are logged server-side; clients see generic `"Internal server error"`.

## Sidebar app (`zendesk-sidebar-app/`)

Separate npm workspace built from the official Zendesk React scaffold. Runs inside the Zendesk agent workspace. Currently scaffold-only: pilot-form gating and read-only linked-item display work; `Create new ADO` and `Link existing ADO` still need backend endpoints on the main service (APP-005). Driven by its own `package.json` — use `npm run app:*` from the repo root.

## Not yet built (Phase 4+)

- **Reverse sync** — ADO service hooks -> update Zendesk fields with engineering status, sprint dates, ETA
- **Sidebar app backend endpoints** — summary, create, link-existing (APP-005)
- **Stable public ingress** — currently a Cloudflare quick tunnel (see operational caveats below)
- **Comment/attachment sync** (Phase 6)

## Implementation Guardrails

- Keep the integration standalone — no coupling to MusaOS or MyReports runtime code
- Oracle-backed worker tables are the v1 execution model (not AQ — `DBMS_AQADM` is unavailable in the `AUTOMATION` schema)
- Secrets in `.env` only — never in docs, tests, or committed files
- Use the routing matrix (`docs/proposals/ZENDESK-ADO-V1-ROUTING-MATRIX.md`) and field definitions (`docs/proposals/ZENDESK-ADO-V1-FIELD-DEFINITIONS.md`) for v1 mapping behavior
- Prefer durable async processing over inline webhook-side work when the target design calls for persistence or retries
- Do not auto-escalate every Zendesk ticket — require explicit escalation criteria
- Zendesk native status stays separate from ADO engineering status (synced via `ADO Status` field)

## Configuration

All config from environment variables, loaded in `config.ts`. Copy `.env.example` to `.env`. `npm start` uses `--env-file-if-exists=.env` so no dotenv package is required.

Required today: `ZENDESK_WEBHOOK_SECRET`, `ZENDESK_API_TOKEN`, `ZENDESK_API_EMAIL`, `DEVAZURE_ORG_URL`, `DEVAZURE_PROJECT`, `DEVAZURE_PAT`, and `ORACLE_*` connection vars (user, password, connectString). Signature verification can be bypassed with `ZENDESK_SKIP_SIGNATURE_VERIFICATION=true` for local testing only.

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

## Latest Live Pilot Status (2026-04-17)

- Live Zendesk -> ADO create flow is working end to end on the real tenant and host.
- Verified working access with existing local `.env` credentials to Zendesk (admin API user), Azure DevOps (PAT), Oracle (`AUTOMATION` on `SUPPOPS`), and the Linux Docker host.
- The service is running on the host at `127.0.0.1:8787`, with a temporary Cloudflare quick tunnel container named `zendesk-ado-quicktunnel` exposing it publicly.
- Current pilot webhook endpoint: `https://dare-appearing-notices-defensive.trycloudflare.com/webhooks/zendesk`
- Zendesk webhook in use: `Zendesk to ADO Pilot Webhook (cloudflare quick tunnel)` (`01KPE1WQ42VRSPAK78HP1EHXK2`)
- Zendesk trigger in use: `Zendesk -> ADO Pilot Create [Musa ADO Form Testing]` (`50913782165651`)
- Pilot trigger scope: form `Musa ADO Form Testing`, tag `ado_sync_pilot`, and only when `ADO Work Item ID` is blank. The trigger removes the tag after firing.
- The `Musa ADO Form Testing` form is now attached to the `Jesta I.S.` brand and moved near the top of the form list so agents can actually select it.
- Ticket `#39045` successfully created Azure DevOps Bug `#79741`, and Zendesk field writeback succeeded (`ADO Work Item ID`, URL, status, sync health, last sync timestamp).
- Oracle confirms the live link and audit trail for ticket `39045` -> work item `79741`.
- `src/routing.ts` was corrected and deployed with live ADO classification node paths. The old paths were stale and caused `TF401347` invalid area-path failures.
- `src/server.ts` was corrected and deployed to dedupe on `x-zendesk-webhook-invocation-id` first, because the rendered Zendesk payload `id` was too coarse for safe same-day retries.
- `npm run build` and `npm test` both passed before the live redeploy.

## Current Operational Caveats

- The quick tunnel is a stopgap only. Its public URL is ephemeral and may change if the tunnel container restarts.
- `myprojects.jestais.com` is not usable for Zendesk webhooks in its current state because Zendesk resolves it to private IP `172.16.20.97` and rejects it as restricted.
- A direct public-IP fallback to `http://199.243.93.100/...` also failed from Zendesk due to timeout.
- Production still needs stable public ingress and HTTPS for the host, or an approved hosted middleware alternative.
- The live service is still one-way only right now: Zendesk -> ADO create/update plus Zendesk field writeback. Reverse ADO -> Zendesk sync is not deployed yet.

## Current UX Direction

- The preferred v1 agent UX is now a small private Zendesk sidebar app, not an always-visible ADO field block and not a separate ADO-specific form.
- Reason for the pivot: the client wants the best agent experience in a single rollout and does not want to train users twice or run change management twice.
- The official React scaffold-based app package now exists under `zendesk-sidebar-app/`.
- That package builds successfully and already implements pilot-form gating plus read-only linked-item display from the current Zendesk custom fields.
- The app is not yet installed in the live Zendesk tenant, and the `Create new ADO` / `Link existing ADO` actions are still scaffold-only until backend app endpoints are added.
- The app should be the primary UI for:
  - `Create new ADO`
  - `Link existing ADO`
  - current linked ADO reference and status display
- During development and pilot, the app should hide itself unless the ticket is on the designated pilot form. Current pilot form: `Musa ADO Form Testing` (`50882600373907`). Expand beyond that only after testing is complete and go-live scope is approved.
- The machine-owned `ADO *` sync fields should stay off the normal `Support` workflow forms unless needed for testing, reporting, or trigger plumbing.
- `Dev Funnel #` should still be populated with the ADO deep link when a ticket is linked so legacy support workflows retain a familiar visible reference.
