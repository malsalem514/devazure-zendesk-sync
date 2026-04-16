# Tracks

## Active

| ID | Title | Status | Priority | Notes |
| --- | --- | --- | --- | --- |
| APP-003 | Bidirectional status, sprint, and ETA sync (Phase 4) | implemented (pending live verification) | high | ADO webhook, status derivation, iteration cache, reconciler all in-repo; service-hook registration script ready |
| OPS-001 | Linux Docker deployment package (Phase 5) | next | medium | Compose stack, env contract, health checks, and Caddy integration |
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

Phases 1-4 are implemented in-repo. Phase 4 adds:
- `src/ado-status.ts` — status derivation, detail templates, iteration cache, fingerprint
- `DevAzureClient.getWorkItem` / `.getIteration`
- `src/ado-event-parser.ts` + `POST /webhooks/ado` (Basic auth)
- `sync_ado_state_to_zendesk` handler with no-op fingerprint check
- `src/reconciler.ts` — 15-minute cron polling safety net
- `scripts/register-ado-service-hook.mjs` — subscription setup helper

Live verification still pending: ADO service-hook subscription creation, end-to-end trigger of reverse sync on a real ticket/work-item pair. The next workstream is Phase 5 (Docker deployment).
