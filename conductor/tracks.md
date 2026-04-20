# Tracks

## Active

| ID | Title | Status | Priority | Notes |
| --- | --- | --- | --- | --- |
| APP-005 | Zendesk sidebar app package + app endpoints | in_progress | high | Scaffold exists at `zendesk-sidebar-app/`. Backend: `GET /app/ado/tickets/:id/summary` landed with ZAF JWT auth (`ZENDESK_APP_SHARED_SECRET`). Next: wire scaffold to the summary endpoint, then build `POST .../create` and `POST .../link`, then install as private app in live tenant. |
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
| HOTFIX-001 | Live pilot hotfixes: ADO area paths (lowercase keys, corrected tree names), `x-zendesk-webhook-invocation-id` dedup, `Dev Funnel #` writeback | 2026-04-17 |
| PILOT-E2E-1 | First live round-trip: Zendesk #39045 → ADO Bug #79741 with Oracle link + audit + field writeback confirmed | 2026-04-17 |
| MERGE-001 | Unify `claude/amazing-darwin` worktree into `main`: Phase 4/5 code, CLOB fix, admin scripts + pilot hotfixes + sidebar-app scaffold now on a single linear branch | 2026-04-20 |
| OPS-DEPLOY-2 | Live deploy of unified `main` to `ubuntu-docker-host`: image rebuilt, container healthy, `dryRun=false`, first live reverse-sync job (`sync_ado_state_to_zendesk` #601) completed in 11 s with zero retries | 2026-04-20 |
| APP-005a | Backend summary endpoint for sidebar app: `GET /app/ado/tickets/:id/summary`, ZAF JWT verifier (`src/lib/zaf-auth.ts`), view-model assembler, 15 unit tests | 2026-04-20 |
| CLEAN-001 | Purged 282 DEAD `sync_ado_state_to_zendesk` rows accumulated from the pre-deploy handler gap (kept 1 real DEAD `create_ado_from_zendesk` for audit) | 2026-04-20 |

## Current Implementation Gap

All Phase 1–5 code is implemented, deployed to `ubuntu-docker-host`, and validated end-to-end. Zendesk → ADO round-trip confirmed on 2026-04-17 (Zendesk #39045 → ADO Bug #79741). ADO → Zendesk reverse sync confirmed on 2026-04-20 (reconciler job #601 cleared in 11 s, zero retries). The stack runs in `SYNC_DRY_RUN=false` with Oracle pool + schema + worker + reconciler all live, and `main` is on `origin`.

Before 2026-04-20 the live host was running a mid-branch snapshot that enqueued reverse-sync jobs without a registered handler, so 278 jobs had accumulated in `STATUS='DEAD'` with "Unknown job type: sync_ado_state_to_zendesk". Those rows are kept as historical audit; after `OPS-DEPLOY-2` the new enqueues succeed.

The **v1 UX direction pivoted** to a private Zendesk sidebar app (`APP-005`) rather than always-visible ADO fields on support forms — one rollout, better agent experience, no double training. The scaffold package already exists; the next work is backend endpoints and a tenant install.

Two unrelated blockers remain:

1. **Inbound reachability (`OPS-002`)** — Zendesk and ADO must POST to a public HTTPS URL. The pilot currently uses a temporary Cloudflare quick tunnel. Permanent go-live needs: (a) DNS record `zendesk-sync.jestais.com`, (b) TCP 443 port-forward from jestais firewall to `172.16.20.97:443`, (c) `caddy reload` with the staged site block, (d) `scripts/register-zendesk-webhook.mjs` + `scripts/register-ado-service-hook.mjs` to re-register hooks against the stable URL.
2. **Sidebar app endpoints (`APP-005`)** — see `docs/proposals/ZENDESK-SIDEBAR-APP-IMPLEMENTATION-SPEC.md` for the `GET /app/ado/tickets/:id/summary`, `POST .../create`, `POST .../link` contract, ZAF JWT auth, and rollout milestones.

After both are resolved, the next workstream is Phase 6 (`APP-004`, comment + attachment sync).
