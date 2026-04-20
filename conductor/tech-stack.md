# Tech Stack

## Languages And Frameworks

| Technology | Version / State | Purpose |
| --- | --- | --- |
| Node.js | `>=24.14.0 <25.0.0` | Runtime for the standalone integration service |
| TypeScript | `^5.9.3` | Service implementation and type safety |
| Node built-ins | current runtime pattern | HTTP server, crypto, fetch, and test support without framework lock-in |
| React | `^18.2.0` in `zendesk-sidebar-app/` | Private Zendesk sidebar app UI |
| Vite | `^6.x` in `zendesk-sidebar-app/` | Build tool for the Zendesk sidebar app package |
| Zendesk Garden | `^8.x` packages in `zendesk-sidebar-app/` | Native-feeling app UI components for Agent Workspace |

## Current Codebase Shape

| Area | Current State | Notes |
| --- | --- | --- |
| `src/server.ts` | implemented | Raw HTTP webhook server and request handling |
| `src/zendesk-signature.ts` | implemented | Zendesk HMAC verification |
| `src/zendesk-event-parser.ts` | implemented | Ticket event normalization for the starter flow |
| `src/sync-planner.ts` | implemented | Starter create/update planning and field mapping |
| `src/devazure-client.ts` | implemented | Azure DevOps work item lookup and JSON Patch operations |
| `test/*.test.mjs` | implemented | Node built-in tests for signature logic and sync planning |
| `zendesk-sidebar-app/` | scaffold started | Private Zendesk sidebar app package based on the official React scaffold pattern |

## Target Runtime Dependencies

| Package | Version | Purpose | Decision Basis |
| --- | --- | --- | --- |
| `oracledb` | `^6.10.0` | Oracle connection pool, queries, thin mode (no Instant Client needed) | Proven in myreports project; thin mode confirmed working with `AUTOMATION@srv-db-100/SUPPOPS` |
| `node-zendesk` | `^6.0.1` | Zendesk API client: ticket fields, comments, webhooks, triggers | 65K+/week downloads, recommended by Zendesk docs, only maintained Node.js client |
| `node-cron` | `^3.x` | Schedule worker polling and reconciliation runs | Lightweight, 1.1M/week downloads, no external deps |

## Target Dev Dependencies

| Package | Version | Purpose | Decision Basis |
| --- | --- | --- | --- |
| `azure-devops-node-api` | `^15.1.2` | TypeScript type imports only (`import type`) for work items, WIQL, iterations | Microsoft official; types strengthen our fetch layer without adding a new HTTP dep |

## Target Runtime Additions

| Component | Intended Choice | Notes |
| --- | --- | --- |
| Primary datastore | Oracle (`SUPPOPS`, `AUTOMATION` schema) | Durable sync ledger, links, retries, audit, and worker tables |
| Oracle driver | `oracledb` v6.10 thin mode | Copy pool + query pattern from `myreports/lib/oracle.ts`; connect string `srv-db-100/SUPPOPS` |
| Queue / worker model | Oracle-backed worker tables with `SELECT FOR UPDATE SKIP LOCKED` | Oracle 19c supports SKIP LOCKED natively; modeled after yoomoney/db-queue |
| Zendesk API client | `node-zendesk` v6 | Covers ticket field CRUD, private notes, webhook/trigger management |
| ADO API client | Hand-rolled fetch + Basic auth (PAT), typed with `azure-devops-node-api` interfaces | SDK's HTTP layer (`typed-rest-client`) adds unnecessary complexity; service hooks not in SDK |
| Scheduler | `node-cron` | Triggers worker polling (every N seconds) and reconciliation (every 15 min) |
| Bidirectional sync pattern | Truto.one 5-pillar pattern | Origin tagging, fingerprint comparison, sync journal, dedup key, field ownership |
| Loop prevention | Origin stamp + fingerprint hash + integration marker in comments | Comment bodies stamped with `[Synced from {system} by integration]` |
| Deployment | Docker on client Linux host | Separate stack under `/srv/stacks/<integration-name>` |
| Reverse proxy | Host-level Caddy | Follow current live-host pattern |
| Temporary pilot ingress | Cloudflare Quick Tunnel -> `127.0.0.1:8787` | Stopgap for Zendesk webhook reachability without waiting on IT; ephemeral URL, not production-grade |
| Upstream systems | Zendesk + Azure DevOps | Standalone client-owned integration boundary |

## Packages Explicitly Not Adopted

| Package / Tool | Reason Not Adopted |
| --- | --- |
| Express / Fastify | `node:http` is sufficient; zero-dep HTTP keeps the service simple |
| Redis / pg-boss / bull | Oracle is the mandated store; no separate queue infrastructure |
| `azure-devops-node-api` (runtime) | Service hooks not covered; `typed-rest-client` HTTP layer adds complexity over our fetch approach |
| Zendesk webhook signature packages | None exist; our 10-line `crypto.createHmac` implementation is correct |
| Temporal / workflow engines | Overkill for v1 volume |

## Key External Constraints

| Constraint | Current Understanding |
| --- | --- |
| Azure DevOps org | `https://dev.azure.com/jestaisinc` |
| Known visible ADO projects | `VisionSuite`, `Vision Analytics` |
| Zendesk tenant | `https://jestaissupport.zendesk.com` |
| Linux target host model | Ubuntu Docker host with loopback bind + Caddy |
| Public ingress reality | `myprojects.jestais.com` currently resolves to private `172.16.20.97` from Zendesk's point of view, and direct public-IP HTTP timed out during live testing on 2026-04-17 |
| Secrets handling | Real credentials belong only in local `.env`, not in docs or committed files |

## Dev Tools

| Tool | Purpose | Usage |
| --- | --- | --- |
| `npm run build` | Compile TypeScript | Must pass before delivery |
| `npm run typecheck` | Type-only validation | Use during implementation |
| `npm test` | Build + run Node tests | Current regression baseline |
| `npm run app:install` | Install app-package dependencies | Uses the `zendesk-sidebar-app/` package |
| `npm run app:dev` | Run sidebar app Vite dev server | Pair with ZCLI from `zendesk-sidebar-app/` during local Zendesk testing |
| `npm run app:build` | Build the Zendesk sidebar app | Produces `zendesk-sidebar-app/dist/` for private-app packaging |

## Documented Source Of Truth

- Product and delivery context: [product.md](./product.md)
- Working conventions and document precedence: [workflow.md](./workflow.md)
- Current and upcoming workstreams: [tracks.md](./tracks.md)
- Design source material: [../docs/README.md](../docs/README.md)
