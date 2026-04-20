# Tracks

## Active

| ID | Title | Status | Priority | Notes |
| --- | --- | --- | --- | --- |
| APP-005 | Zendesk sidebar app package + app endpoints | in_progress | high | Official React scaffold-based package exists in `zendesk-sidebar-app/`; next work is backend summary/create/link endpoints, Zendesk installation, and pilot validation |
| APP-003 | Bidirectional status, sprint, and ETA sync (Phase 4) | next | high | ADO service hooks/polling, status derivation, iteration cache, reconciler |
| OPS-001 | Linux Docker deployment package (Phase 5) | in_progress | medium | Live pilot is running on `ubuntu-docker-host`; stable public ingress is still unresolved, so Zendesk currently reaches the app through a temporary Cloudflare quick tunnel |
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

Phases 1-3 are done and validated live. On 2026-04-17, ticket `#39045` in Zendesk successfully created Azure DevOps Bug `#79741`, with Oracle link/audit rows and Zendesk field writeback confirmed.

The current pilot path is:

- Zendesk trigger `50913782165651`
- Form `Musa ADO Form Testing`
- Tag gate `ado_sync_pilot`
- Webhook `01KPE1WQ42VRSPAK78HP1EHXK2`
- Temporary public ingress via Cloudflare quick tunnel to the host service on `127.0.0.1:8787`

What remains before this is production-ready:

- install and validate the scaffolded Zendesk sidebar app on `Musa ADO Form Testing`
- add app-facing backend endpoints for summary, create, and link-existing flows
- replace the temporary quick tunnel with stable public HTTPS ingress
- implement Phase 4 reverse ADO -> Zendesk sync
- expand the pilot from `Musa ADO Form Testing` to broader support forms only after ingress and reverse-sync expectations are clear
- keep hardening replay protection and operator visibility now that real traffic has been proven
