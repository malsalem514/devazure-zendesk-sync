# Tracks

## Active

| ID | Title | Status | Priority | Notes |
| --- | --- | --- | --- | --- |
| OPS-002 | Public URL + Caddy go-live | blocked (IT) | high | Waiting on DNS record for `zendesk-sync.jestais.com` + TCP 443 port-forward from jestais firewall/NAT to `172.16.20.97`. Caddy site block staged at `/tmp/caddy-zendesk-sync.snippet` on host, hook-registration scripts ready. |
| APP-004 | Comment and attachment sync policy (Phase 6) | planned | medium | Private-note-first comment sync with integration marker, link-existing workflow (paste ADO URL), relink audit trail |
| HARDEN-001 | Observability and replay protection | planned | medium | `POST /internal/reconcile`, `GET /internal/failed-jobs`, log rotation, structured logs, kill-switch flag |
| ROUTE-001 | Product-family routing approvals | external | medium | 5 families pending business sign-off: `BI`, `Reports`, `Ecomm`, `Planning`, `Planning.net`. Integration currently returns low-confidence fallback for these. |

## Completed

| ID | Title | Completed |
| --- | --- | --- |
| BASE-001 | Standalone one-way Zendesk → ADO starter service | 2026-04-15 |
| DOC-000 | Project-specific specs migrated into local `docs/` tree | 2026-04-16 |
| DOC-001 | Agent-optimized project context and docs index | 2026-04-16 |
| RES-001 | SOTA inventory: packages, patterns, and build-vs-buy decisions | 2026-04-16 |
| APP-001 | Oracle-backed persistence and worker model (Phase 1) | 2026-04-16 |
| APP-001b | Zendesk custom fields + API client (Phase 2) | 2026-04-16 |
| APP-002 | Routing engine + durable ADO creation + worker (Phase 3) | 2026-04-16 |
| APP-003 | Bidirectional status, sprint, and ETA sync (Phase 4) | 2026-04-16 |
| BUG-001 | CLOB-as-Lob payload parse bug (caught by first live loopback test) | 2026-04-16 |
| OPS-001 | Linux Docker deployment package (Phase 5) | 2026-04-16 |
| OPS-DEPLOY-1 | First-boot on `ubuntu-docker-host`: container healthy, Oracle pool + schema + worker + reconciler all live | 2026-04-16 |
| ZD-FORM-1 | Pilot sandbox form: `Musa ADO Form Testing` (ID `50882600373907`) cloned from Support, agents-only, 10 ADO fields attached | 2026-04-16 |

## Current Implementation Gap

All code for Phases 1-5 is implemented and the stack is running live on `ubuntu-docker-host` in `SYNC_DRY_RUN=false` mode (Oracle pool connected, schema initialized, worker + reconciler crons ticking, health + readiness endpoints green). Phase 4 reverse-sync has been verified **internally** via a signed loopback webhook: event persisted → job picked up → handler ran → completed without error.

The only gap preventing real end-to-end traffic is **inbound reachability**. Zendesk and ADO need to POST to a public HTTPS URL, which requires:

1. DNS record `zendesk-sync.jestais.com` pointing at the jestais public IP
2. TCP 443 port-forward on the jestais firewall → `172.16.20.97:443`
3. Caddy site block (staged on the host, one-line apply)
4. Run `scripts/register-zendesk-webhook.mjs` to create the Zendesk webhook + fetch signing secret into `.env`
5. Run `scripts/register-ado-service-hook.mjs` to create the ADO service-hook subscriptions
6. Create a test ticket on `Musa ADO Form Testing` and observe the full round trip

After e2e verification, the next workstream is Phase 6 (`APP-004`).
