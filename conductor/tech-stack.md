# Tech Stack

## Languages And Frameworks

| Technology | Version / State | Purpose |
| --- | --- | --- |
| Node.js | `>=24.14.0 <25.0.0` | Runtime for the standalone integration service |
| TypeScript | `^5.9.3` | Service implementation and type safety |
| Node built-ins | `node:http`, `node:crypto`, `fetch`, `node:test` | HTTP server, HMAC verification, outbound HTTP, and test runner without framework lock-in |

## Runtime Dependencies

| Package | Version | Purpose |
| --- | --- | --- |
| `oracledb` | `^6.10.0` | Oracle connection pool + queries, thin mode (no Instant Client). `fetchAsString = [CLOB]` set at pool init so `SYNC_JOB.PAYLOAD` deserializes as string |
| `node-zendesk` | `^6.0.1` | Zendesk API client for custom field CRUD, ticket updates, private notes, webhook management |
| `node-cron` | `^3.0.3` | Scheduling: worker poll (10s), stale-job recovery (5m), reconciler (every 15m at `:07 :22 :37 :52`) |

## Dev Dependencies

| Package | Version | Purpose |
| --- | --- | --- |
| `azure-devops-node-api` | `^15.1.2` | TypeScript type imports only (`import type`) for work items, WIQL, iterations. SDK's HTTP layer is not used |
| `typescript` | `^5.9.3` | Build-time TS compilation |
| `@types/node` | `^20.11.17` | Node stdlib types |

## Current Codebase Shape

### HTTP server + webhooks

| File | Purpose |
| --- | --- |
| `src/index.ts` | Boot: load config, create Oracle pool, initialize schema, start HTTP server, start cron tasks, wire SIGTERM/SIGINT |
| `src/server.ts` | Raw HTTP: `/health`, `/healthz`, `/readyz`, `POST /webhooks/zendesk` (HMAC), `POST /webhooks/ado` (Basic auth) |
| `src/config.ts` | Env var loading + validation |
| `src/types.ts` | `AppConfig` + shared data shapes |

### Inbound parsers + signature

| File | Purpose |
| --- | --- |
| `src/zendesk-signature.ts` | HMAC-SHA256 verification over `timestamp + body` |
| `src/zendesk-event-parser.ts` | Parse `zen:event-type:ticket.*` payloads |
| `src/ado-event-parser.ts` | Parse ADO service-hook payloads (`workitem.created`, `workitem.updated`) |

### Outbound clients

| File | Purpose |
| --- | --- |
| `src/devazure-client.ts` | ADO REST: WIQL lookup, create / update work items, `getWorkItem`, `getIteration`; typed `DevAzureHttpError` |
| `src/lib/zendesk-api.ts` | Zendesk client wrapper: `updateTicketWithNote` (fields + private note in one call), ticket field / form CRUD |
| `src/lib/basic-auth.ts` | Shared `buildBasicAuthHeaderValue` used by the ADO client and webhook receiver |

### Sync pipeline

| File | Purpose |
| --- | --- |
| `src/sync-planner.ts` | Build JSON Patch operations + required ADO fields from a ticket event |
| `src/routing.ts` | V1 routing matrix: 13 product families → project + area path + `Custom.Product` |
| `src/job-handlers.ts` | `handleSyncZendeskToAdo` (create / update) + `handleSyncAdoStateToZendesk` (reverse) |
| `src/ado-status.ts` | Status derivation, status-detail templates, iteration metadata cache, SHA-256 fingerprint |
| `src/worker.ts` | Durable worker: `SELECT FOR UPDATE SKIP LOCKED`, retries, stale recovery; exports `JOB_TYPES` |
| `src/reconciler.ts` | 15-min cron polling safety net for missed ADO service-hook events |

### Persistence

| File | Purpose |
| --- | --- |
| `src/lib/oracle.ts` | Pool singleton, `query` / `execute` / `executeMany`, `healthCheck`, `closePool`, `safeExecuteDDL` |
| `src/schema.ts` | Idempotent DDL: `SYNC_LINK`, `SYNC_EVENT`, `SYNC_JOB`, `SYNC_ATTEMPT`, `AUDIT_LOG`, `ITERATION_CACHE` |
| `src/zendesk-field-ids.ts` | Tenant-specific field ID map (Jestais) |
| `src/types/oracledb.d.ts` | Ambient type declarations for the subset of `oracledb` we use |

### Tests (Node's built-in runner)

| File | Coverage |
| --- | --- |
| `test/zendesk-signature.test.mjs` | HMAC verification happy + failure paths |
| `test/sync-planner.test.mjs` | Create plan shape, destructive-event noop |
| `test/ado-status.test.mjs` | Status derivation, detail templates, fingerprint stability |
| `test/ado-event-parser.test.mjs` | ADO payload parsing + shape validation |

### Admin scripts (`scripts/`)

| Script | Purpose |
| --- | --- |
| `create-zendesk-fields.mjs` | Create the 10 ADO fields in the Zendesk tenant (idempotent) |
| `clone-zendesk-form.mjs` | Clone an existing form + attach ADO fields, agents-only option |
| `detach-zendesk-fields.mjs` / `find-zendesk-form-attachments.mjs` | Audit + remove ADO fields from forms |
| `register-zendesk-webhook.mjs` | Create (or re-use) the Zendesk → us webhook; fetch signing secret |
| `register-ado-service-hook.mjs` | Register ADO `workitem.updated` + `workitem.created` service-hook subscriptions |
| `lib/zendesk.mjs` | Shared client bootstrap + `V1_FIELDS` + `unwrapTicketForm` |

### Deployment

| File | Purpose |
| --- | --- |
| `Dockerfile` | Two-stage node:24-slim build, non-root, Node-fetch HEALTHCHECK |
| `docker-compose.yml` | Loopback bind `127.0.0.1:8787`, `extra_hosts` for `srv-db-100`, Watchtower label |
| `.dockerignore` | Excludes node_modules, dist, .claude, .env, tests, docs |
| `docs/ops/deployment.md` | Bring-up runbook, Caddy site block, service-hook registration commands |

## Runtime Pattern

| Concern | How |
| --- | --- |
| Primary datastore | Oracle (`SUPPOPS`, `AUTOMATION` schema) — durable ledger, links, retries, audit, worker tables, iteration cache |
| Oracle driver | `oracledb` v6 thin mode; pool init in `src/lib/oracle.ts` |
| Queue / worker | Oracle-backed worker tables with `SELECT FOR UPDATE SKIP LOCKED`; polling every 10 s, 50-job batch cap |
| Dedup | `SYNC_EVENT.DEDUP_KEY` unique constraint; `ORA-00001` catch instead of `SELECT`-then-`INSERT` (TOCTOU-free) |
| Loop prevention | Origin-stamped private-note marker `[Synced by integration]`; SHA-256 fingerprint on `SYNC_LINK.LAST_ADO_FINGERPRINT` short-circuits redundant writes |
| Scheduler | `node-cron` — worker poll `*/10 * * * * *`, stale recovery `*/5 * * * *`, reconciler `7,22,37,52 * * * *` |
| Deployment | Docker on client Linux host; separate stack at `/srv/stacks/zendesk-ado-sync/`; loopback bind + host-level Caddy |

## Packages Explicitly Not Adopted

| Package / Tool | Reason |
| --- | --- |
| Express / Fastify | `node:http` is sufficient; zero-framework HTTP keeps the service simple |
| Redis / pg-boss / bull | Oracle is the mandated store; no separate queue infrastructure |
| `azure-devops-node-api` runtime client | Service hooks aren't covered; `typed-rest-client` HTTP layer adds complexity over our fetch approach |
| Zendesk webhook signature packages | None exist; our 10-line `crypto.createHmac` is correct |
| Temporal / workflow engines | Overkill for v1 volume |
| Oracle Advanced Queuing (`DBMS_AQADM`) | Not available in the `AUTOMATION` schema; worker tables fill the role |
| Oracle Instant Client | Not needed — thin-mode driver |
| `cloudflared` | Evaluated as alternative to public DNS + firewall; rejected because operator lacks Cloudflare dashboard access for `jestais.com` |

## Key External Constraints

| Constraint | Current Understanding |
| --- | --- |
| Azure DevOps org | `https://dev.azure.com/jestaisinc` |
| Known visible ADO projects | `VisionSuite`, `Vision Analytics` |
| Zendesk tenant | `https://jestaissupport.zendesk.com` |
| Pilot Zendesk form | `Musa ADO Form Testing` (ID `50882600373907`, agents-only, 10 ADO fields attached) |
| Oracle DB | `AUTOMATION@srv-db-100/SUPPOPS`, Oracle 19c |
| Linux target host | `ubuntu-docker-host` (172.16.20.97), Ubuntu 24.04, user `admin` (in `sudo` + `docker` groups) |
| Host networking | `127.0.0.1:8787` loopback; `srv-db-100` pinned to `172.16.25.63` via `extra_hosts` |
| Secrets | Real credentials only in `/srv/stacks/zendesk-ado-sync/.env` on the host and `~/Projects/devazure-zendesk-sync/.env` locally — never in committed files |
| Public URL | Pending IT — DNS for `zendesk-sync.jestais.com` + TCP 443 port-forward to the host |

## Dev Tools

| Tool | Purpose |
| --- | --- |
| `npm run build` | Compile TypeScript (must pass before delivery / test) |
| `npm run typecheck` | Type-only validation during implementation |
| `npm test` | Build + run Node tests (regression baseline) |
| `npm run package:standalone` | Generate `release/devazure-zendesk-sync/` tarball candidate |

## Documented Source Of Truth

- Product and delivery context: [product.md](./product.md)
- Working conventions and document precedence: [workflow.md](./workflow.md)
- Current and upcoming workstreams: [tracks.md](./tracks.md)
- Deployment / runbook: [../docs/ops/deployment.md](../docs/ops/deployment.md)
- Design source material: [../docs/README.md](../docs/README.md)
