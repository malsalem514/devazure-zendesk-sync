# Tracks

## Active

| ID | Title | Status | Priority | Notes |
| --- | --- | --- | --- | --- |
| DOC-001 | Agent-optimized project context and docs index | completed | high | Added structured context docs and a clearer docs landing page |
| APP-001 | Oracle-backed persistence and worker model | next | high | Replace tag-only deduplication with durable Oracle tables and async processing |
| APP-002 | Zendesk create/link and ADO link model | planned | high | Support agent-driven create-new and link-existing workflows |
| APP-003 | Bidirectional status, sprint, and ETA sync | planned | high | Reflect ADO state back into Zendesk-owned fields |
| APP-004 | Comment and attachment sync policy implementation | planned | medium | Start private-note-first and expand only where approved |
| OPS-001 | Linux Docker deployment package | planned | medium | Compose stack, env contract, health checks, and Caddy integration |
| HARDEN-001 | Observability and replay protection | planned | medium | Structured logging, retries, reconciliation, and webhook hardening |

## Completed

| ID | Title | Completed |
| --- | --- | --- |
| BASE-001 | Standalone one-way Zendesk -> ADO starter service | 2026-04-15 |
| DOC-000 | Project-specific specs migrated into local `docs/` tree | 2026-04-16 |
| DOC-001 | Agent-optimized project context and docs index | 2026-04-16 |
| RES-001 | SOTA inventory: packages, patterns, and build-vs-buy decisions | 2026-04-16 |

## Current Implementation Gap

The repo currently runs a safe one-way starter. The next major step is to align code with the documented v1 target by adding Oracle persistence, worker tables, richer routing, and bidirectional sync behavior.
