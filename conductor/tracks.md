# Tracks

## Active

| ID | Title | Status | Priority | Notes |
| --- | --- | --- | --- | --- |
| APP-005 | Zendesk sidebar app package + app endpoints | visual-smoke | high | Backend endpoints, frontend wiring, tenant install, tunnel guardian, live endpoint validation, and refreshed private-app package upload are done. Remaining: one visual smoke in Zendesk on the `Musa ADO Form Testing` form. Blocker: sidebar points at the Cloudflare quick tunnel; if that URL rotates, the install's `backendBaseUrl` has to be updated until `OPS-002` lands a stable public URL. |
| OPS-002 | Public URL + Caddy go-live | blocked (IT) | high | Waiting on DNS record for `zendesk-sync.jestais.com` + TCP 443 port-forward from jestais firewall/NAT to `172.16.20.97`. DNS still did not resolve from local verification on 2026-04-23. Caddy site block staged at `/tmp/caddy-zendesk-sync.snippet` on host, hook-registration scripts ready. |
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
| APP-005b | Backend create + link endpoints: `POST /app/ado/tickets/:id/create` (immediate, idempotent via `SYNC_LINK`) and `POST .../link` (numeric ID or ADO URL, adds `zendesk:id` tag, writes current ADO state). Sidebar scaffold wired to all three endpoints with direct-field fallback. 45 unit tests. Smoke-tested live against ticket #39045 → ADO #79741. | 2026-04-20 |
| APP-005c | Sidebar app installed in `jestaissupport.zendesk.com` (app_id `1240317`, installation `50988210128019`, product `support`, enabled). Settings: `backendBaseUrl` → current Cloudflare quick tunnel URL, `appSharedSecret` → stored encrypted in Zendesk secure settings. | 2026-04-20 |
| OPS-003 | Tunnel guardian: `scripts/tunnel-guardian.sh` runs every 5 min via host crontab, diffs the live cloudflared URL against the Zendesk installation's `backendBaseUrl`, PUTs a partial-settings update when drift detected. Fault-injection test confirmed self-heal and `appSharedSecret` survives the write. Logs to `/srv/stacks/zendesk-ado-sync/tunnel-guardian.log`. | 2026-04-20 |
| CLEAN-001 | Purged 282 DEAD `sync_ado_state_to_zendesk` rows accumulated from the pre-deploy handler gap (kept 1 real DEAD `create_ado_from_zendesk` for audit) | 2026-04-20 |
| BUG-002 | Sidebar create live hotfixes: unwrap `node-zendesk` v6 `tickets.show()` response shape and avoid Oracle reserved bind name `:mode` in `SYNC_LINK` insert. Deployed to `ubuntu-docker-host`; container healthy with `dryRun=false` and `oracle=true`. | 2026-04-23 |
| APP-005d | Live sidebar endpoint validation: signed summary confirmed ticket #39045 → ADO #79741; idempotent Create/Link on #39045 returned `already_linked`; fresh Create passed with Zendesk #39220 → ADO #79922; fresh Link passed with Zendesk #39221 → ADO #79922. Failed-attempt validation ticket #39218 repaired to ADO #79921; all validation tickets now have active `SYNC_LINK` rows. | 2026-04-23 |
| APP-005e | Refreshed sidebar private app package uploaded to Zendesk app `1240317`; ZCLI validation passed, App API update job completed, installation `50988210128019` re-enabled, and `backendBaseUrl` preserved. | 2026-04-23 |

## Current Implementation Gap

All Phase 1–5 code is implemented, deployed to `ubuntu-docker-host`, and validated end-to-end. Zendesk → ADO round-trip confirmed on 2026-04-17 (Zendesk #39045 → ADO Bug #79741). ADO → Zendesk reverse sync confirmed on 2026-04-20 (reconciler job #601 cleared in 11 s, zero retries). The stack runs in `SYNC_DRY_RUN=false` with Oracle pool + schema + worker + reconciler all live, and `main` is on `origin`.

Before 2026-04-20 the live host was running a mid-branch snapshot that enqueued reverse-sync jobs without a registered handler, so 278 jobs had accumulated in `STATUS='DEAD'` with "Unknown job type: sync_ado_state_to_zendesk". Those rows are kept as historical audit; after `OPS-DEPLOY-2` the new enqueues succeed.

The **v1 UX direction pivoted** to a private Zendesk sidebar app (`APP-005`) rather than always-visible ADO fields on support forms — one rollout, better agent experience, no double training. The backend endpoints, sidebar wiring, tenant install, tunnel guardian, live endpoint validation, and refreshed private-app package upload are now in place; the remaining APP-005 work is one visual smoke in Zendesk.

Two unrelated blockers remain:

1. **Inbound reachability (`OPS-002`)** — Zendesk and ADO must POST to a public HTTPS URL. The pilot currently uses a temporary Cloudflare quick tunnel. Permanent go-live needs: (a) DNS record `zendesk-sync.jestais.com`, (b) TCP 443 port-forward from jestais firewall to `172.16.20.97:443`, (c) `caddy reload` with the staged site block, (d) `scripts/register-zendesk-webhook.mjs` + `scripts/register-ado-service-hook.mjs` to re-register hooks against the stable URL.
2. **Sidebar visual smoke (`APP-005`)** — see `docs/proposals/ZENDESK-SIDEBAR-APP-IMPLEMENTATION-SPEC.md` for the rollout milestones. The live backend and package upload are done; what remains is visually smoking the installed app on the pilot form.

After both are resolved, the next workstream is Phase 6 (`APP-004`, comment + attachment sync).
