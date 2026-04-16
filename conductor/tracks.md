# Tracks

## Active

| ID | Title | Status | Priority | Notes |
| --- | --- | --- | --- | --- |
| APP-003 | Bidirectional status, sprint, and ETA sync (Phase 4) | implemented (pending live verification) | high | ADO webhook, status derivation, iteration cache, reconciler all in-repo; service-hook registration script ready |
| OPS-001 | Linux Docker deployment package (Phase 5) | implemented (pending live deploy) | medium | Dockerfile (multi-stage, node:24-slim, 250MB), docker-compose.yml (loopback bind, extra_hosts), Caddy site block documented; docker build verified locally |
| APP-004 | Comment and attachment sync policy (Phase 6) | planned | medium | Private-note-first comment sync, link-existing workflow |
| HARDEN-001 | Observability and replay protection | planned | medium | Structured logging, operator endpoints, reconciliation hardening |

## Completed

| ID | Title | Completed |
| --- | --- | --- |
| BASE-001 | Standalone one-way Zendesk -> ADO starter service | 2026-04-15 |
| DOC-000 | Project-specific specs migrated into local `docs/` tree | 2026-04-16 |
| DOC-001 | Agent-optimized project context and docs index | 2026-04-16 |
| RES-001 | SOTA inventory: packages, patterns, and build-vs-buy decisions | 2026-04-16 |
| APP-001 | Oracle-backed persistence and worker model (Phase 1) | 2026-04-16 |
| APP-001b | Zendesk custom fields + API client (Phase 2) | 2026-04-16 |
| APP-002 | Routing engine + durable ADO creation + worker (Phase 3) | 2026-04-16 |

## Current Implementation Gap

Phases 1-5 are implemented in-repo. Phase 5 adds:
- `Dockerfile` — multi-stage node:24-slim build, non-root `node` user, built-in-fetch HEALTHCHECK, `UV_THREADPOOL_SIZE=10`
- `docker-compose.yml` — loopback bind (`127.0.0.1:8787`), `extra_hosts` for `srv-db-100`, Watchtower label
- `.dockerignore`
- `docs/ops/deployment.md` — bring-up runbook + Caddy site block

Live deploy tasks still pending (ops-side, not code): populate `.env` on `ubuntu-docker-host`, bring the stack up, add the Caddy site block, run `scripts/register-ado-service-hook.mjs` (or let the reconciler cover it), verify e2e from a real Zendesk ticket. After that, the next workstream is Phase 6 (comment/attachment sync, link-existing workflow).
