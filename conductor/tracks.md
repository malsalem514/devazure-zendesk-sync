# Tracks

## Active

| ID | Title | Status | Priority | Notes |
| --- | --- | --- | --- | --- |
| APP-003 | Bidirectional status, sprint, and ETA sync (Phase 4) | next | high | ADO service hooks/polling, status derivation, iteration cache, reconciler |
| OPS-001 | Linux Docker deployment package (Phase 5) | planned | medium | Compose stack, env contract, health checks, and Caddy integration |
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

Phases 1-3 are done: Oracle persistence, Zendesk custom fields (10 live in tenant), V1 routing matrix, durable SKIP LOCKED job queue, and the Zendesk->ADO create flow with field writeback. The next step is Phase 4: reverse sync from ADO to Zendesk (status derivation, sprint/ETA, service hooks, reconciliation).
